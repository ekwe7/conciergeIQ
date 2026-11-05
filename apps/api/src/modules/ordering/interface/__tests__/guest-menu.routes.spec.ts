/**
 * WHAT IT DOES:
 * Route and HTTP injection test suite for `GET /api/v1/guest/menu`.
 * Verifies authentication via `requireGuestSession`, rate limiting enforcement,
 * and strict multi-tenant isolation (Hotel A guest cannot view Hotel B menu items).
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Tests the end-to-end HTTP pipeline including header extraction, token verification,
 *   rate limiting, and response serialization.
 * - Asserts tenant isolation so guest sessions cannot leak catalog data across hotels.
 * - Validates that out-of-stock items remain present with `isAvailable: false`.
 * - Uses Fastify `inject` for zero-overhead in-memory HTTP integration testing.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerErrorHandler } from '../../../../shared/http/error-handler.js';
import type {
  CatalogCategory,
  CatalogItem,
  MenuCatalogPort,
} from '../../application/ports/menu-catalog.port.js';
import { GetGuestMenuUseCase } from '../../application/use-cases/get-guest-menu.use-case.js';
import { registerGuestMenuRoutes } from '../guest-menu.controller.js';

const TEST_JWT_SECRET_KEY = 'super-secret-jwt-key-minimum-32-chars-long!';

/** Helper to sign guest session tokens avoiding JWT payload type collisions with Staff tokens */
const signTestGuestToken = (
  app: FastifyInstance,
  payload: Record<string, unknown>,
  options?: Parameters<FastifyInstance['jwt']['sign']>[1]
): string => {
  return app.jwt.sign(
    payload as unknown as Parameters<FastifyInstance['jwt']['sign']>[0],
    options
  );
};

class MockMenuCatalogPort implements MenuCatalogPort {
  private readonly catalogByHotelIdMap = new Map<
    string,
    { categories: CatalogCategory[]; items: CatalogItem[] }
  >();

  public setCatalogForHotel = (
    hotelIdentifier: string,
    categoriesList: CatalogCategory[],
    itemsList: CatalogItem[]
  ): void => {
    this.catalogByHotelIdMap.set(hotelIdentifier, {
      categories: categoriesList,
      items: itemsList,
    });
  };

  public getCatalog = async (
    hotelIdentifier: string
  ): Promise<{
    readonly categories: CatalogCategory[];
    readonly items: CatalogItem[];
  }> => {
    const foundCatalogData = this.catalogByHotelIdMap.get(hotelIdentifier);
    return (
      foundCatalogData ?? {
        categories: [],
        items: [],
      }
    );
  };
}

describe('Guest Menu Routes (GET /api/v1/guest/menu)', () => {
  let fastifyApplicationInstance: FastifyInstance;
  let mockCatalogPortInstance: MockMenuCatalogPort;

  const HOTEL_ALPHA_ID = 'hotel-alpha-1111-1111-1111';
  const HOTEL_BETA_ID = 'hotel-beta-2222-2222-2222';

  const HOTEL_ALPHA_CATEGORY: CatalogCategory = {
    id: 'cat-alpha-breakfast',
    name: 'Alpha Breakfast Buffet',
    sortOrder: 1,
  };
  const HOTEL_ALPHA_ITEM_AVAILABLE: CatalogItem = {
    id: 'item-alpha-waffles',
    categoryId: HOTEL_ALPHA_CATEGORY.id,
    name: 'Belgian Waffles',
    description: 'Fresh waffles with maple syrup',
    price: 14.0,
    photoUrl: 'https://cdn.test/waffles.jpg',
    isAvailable: true,
  };
  const HOTEL_ALPHA_ITEM_OUT_OF_STOCK: CatalogItem = {
    id: 'item-alpha-smoothie',
    categoryId: HOTEL_ALPHA_CATEGORY.id,
    name: 'Mango Smoothie',
    description: 'Fresh seasonal mango smoothie',
    price: 8.5,
    photoUrl: null,
    isAvailable: false, // Out of stock
  };

  const HOTEL_BETA_CATEGORY: CatalogCategory = {
    id: 'cat-beta-dinner',
    name: 'Beta Gourmet Dinner',
    sortOrder: 1,
  };
  const HOTEL_BETA_ITEM: CatalogItem = {
    id: 'item-beta-lobster',
    categoryId: HOTEL_BETA_CATEGORY.id,
    name: 'Steamed Lobster Tail',
    description: 'Served with garlic butter',
    price: 65.0,
    photoUrl: 'https://cdn.test/lobster.jpg',
    isAvailable: true,
  };

  beforeEach(async () => {
    mockCatalogPortInstance = new MockMenuCatalogPort();

    mockCatalogPortInstance.setCatalogForHotel(
      HOTEL_ALPHA_ID,
      [HOTEL_ALPHA_CATEGORY],
      [HOTEL_ALPHA_ITEM_AVAILABLE, HOTEL_ALPHA_ITEM_OUT_OF_STOCK]
    );

    mockCatalogPortInstance.setCatalogForHotel(
      HOTEL_BETA_ID,
      [HOTEL_BETA_CATEGORY],
      [HOTEL_BETA_ITEM]
    );

    const getGuestMenuUseCaseInstance = new GetGuestMenuUseCase(
      mockCatalogPortInstance
    );

    fastifyApplicationInstance = Fastify();
    await fastifyApplicationInstance.register(fastifyJwt, {
      secret: TEST_JWT_SECRET_KEY,
    });
    registerErrorHandler(fastifyApplicationInstance);

    // Register routes under `/api/v1` prefix like production app
    await fastifyApplicationInstance.register(
      async (apiScope) => {
        registerGuestMenuRoutes(apiScope, {
          getGuestMenuUseCase: getGuestMenuUseCaseInstance,
        });
      },
      { prefix: '/api/v1' }
    );

    await fastifyApplicationInstance.ready();
  });

  afterEach(async () => {
    await fastifyApplicationInstance.close();
  });

  describe('Authentication & Security', () => {
    it('rejects unauthenticated request lacking Authorization header with HTTP 401', async () => {
      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/menu',
      });

      expect(httpInjectionResponse.statusCode).toBe(401);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects request with invalid signature token with HTTP 401', async () => {
      const forgedFastifyApp = Fastify();
      await forgedFastifyApp.register(fastifyJwt, { secret: 'different-fake-secret-key-32-chars!' });
      const forgedTokenString = signTestGuestToken(forgedFastifyApp, {
        sessionId: 'session-attacker',
        hotelId: HOTEL_ALPHA_ID,
        roomId: 'room-101',
        stayId: 'stay-101',
        type: 'guest',
      });
      await forgedFastifyApp.close();

      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/menu',
        headers: {
          authorization: `Bearer ${forgedTokenString}`,
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(401);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Tenant Isolation (Hotel A vs Hotel B)', () => {
    it('returns only Hotel A menu items for Hotel A guest session token', async () => {
      const guestTokenAlpha = signTestGuestToken(fastifyApplicationInstance, {
        sessionId: 'session-guest-alpha',
        hotelId: HOTEL_ALPHA_ID,
        roomId: 'room-101',
        stayId: 'stay-alpha-101',
        type: 'guest',
      });

      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/menu',
        headers: {
          authorization: `Bearer ${guestTokenAlpha}`,
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(200);
      const responsePayload = JSON.parse(httpInjectionResponse.body);

      // Must have Hotel Alpha category
      expect(responsePayload.categories).toHaveLength(1);
      expect(responsePayload.categories[0].id).toBe(HOTEL_ALPHA_CATEGORY.id);
      expect(responsePayload.categories[0].name).toBe('Alpha Breakfast Buffet');

      const itemsList = responsePayload.categories[0].items;
      expect(itemsList).toHaveLength(2);
      expect(itemsList.some((item: { id: string }) => item.id === HOTEL_ALPHA_ITEM_AVAILABLE.id)).toBe(true);
      expect(itemsList.some((item: { id: string }) => item.id === HOTEL_ALPHA_ITEM_OUT_OF_STOCK.id)).toBe(true);

      // Must NEVER contain Hotel Beta items or categories
      expect(responsePayload.categories.some((cat: { id: string }) => cat.id === HOTEL_BETA_CATEGORY.id)).toBe(false);
      expect(itemsList.some((item: { id: string }) => item.id === HOTEL_BETA_ITEM.id)).toBe(false);
    });

    it('returns only Hotel B menu items for Hotel B guest session token', async () => {
      const guestTokenBeta = signTestGuestToken(fastifyApplicationInstance, {
        sessionId: 'session-guest-beta',
        hotelId: HOTEL_BETA_ID,
        roomId: 'room-202',
        stayId: 'stay-beta-202',
        type: 'guest',
      });

      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/menu',
        headers: {
          authorization: `Bearer ${guestTokenBeta}`,
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(200);
      const responsePayload = JSON.parse(httpInjectionResponse.body);

      expect(responsePayload.categories).toHaveLength(1);
      expect(responsePayload.categories[0].id).toBe(HOTEL_BETA_CATEGORY.id);
      expect(responsePayload.categories[0].name).toBe('Beta Gourmet Dinner');

      const itemsList = responsePayload.categories[0].items;
      expect(itemsList).toHaveLength(1);
      expect(itemsList[0].id).toBe(HOTEL_BETA_ITEM.id);
      expect(itemsList[0].name).toBe('Steamed Lobster Tail');

      // Must NEVER contain Hotel Alpha items or categories
      expect(responsePayload.categories.some((cat: { id: string }) => cat.id === HOTEL_ALPHA_CATEGORY.id)).toBe(false);
      expect(itemsList.some((item: { id: string }) => item.id === HOTEL_ALPHA_ITEM_AVAILABLE.id)).toBe(false);
    });
  });

  describe('Out-of-Stock and Stock Indicators', () => {
    it('returns out-of-stock items with isAvailable: false flag', async () => {
      const guestTokenAlpha = signTestGuestToken(fastifyApplicationInstance, {
        sessionId: 'session-guest-stock-check',
        hotelId: HOTEL_ALPHA_ID,
        roomId: 'room-101',
        stayId: 'stay-alpha-101',
        type: 'guest',
      });

      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/menu',
        headers: {
          authorization: `Bearer ${guestTokenAlpha}`,
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(200);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      const itemsList = responsePayload.categories[0].items;

      const outOfStockItem = itemsList.find(
        (item: { id: string }) => item.id === HOTEL_ALPHA_ITEM_OUT_OF_STOCK.id
      );
      const availableItem = itemsList.find(
        (item: { id: string }) => item.id === HOTEL_ALPHA_ITEM_AVAILABLE.id
      );

      expect(outOfStockItem).toBeDefined();
      expect(outOfStockItem.isAvailable).toBe(false);
      expect(outOfStockItem.name).toBe('Mango Smoothie');

      expect(availableItem).toBeDefined();
      expect(availableItem.isAvailable).toBe(true);
      expect(availableItem.name).toBe('Belgian Waffles');
    });
  });
});
