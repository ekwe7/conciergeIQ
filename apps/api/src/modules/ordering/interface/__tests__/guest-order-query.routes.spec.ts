/**
 * WHAT IT DOES:
 * Fastify route injection test suite for guest order query endpoints:
 * - `GET /api/v1/guest/orders`: Lists orders for the active stay.
 * - `GET /api/v1/guest/orders/:orderId`: Retrieves tracking details for an individual order.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Uses Fastify `inject` for isolated, fast HTTP route verification.
 * - Confirms that unauthenticated requests are rejected with HTTP 401.
 * - Asserts stay boundary isolation: querying an order belonging to another stay returns HTTP 404.
 * - Validates response shapes against the contracts schema.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OrderStatus, type OrderResponse } from '@conciergeiq/contracts';
import { registerErrorHandler } from '../../../../shared/http/error-handler.js';
import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type {
  GetGuestOrderDetailQuery,
  GetGuestOrdersQuery,
} from '../../application/use-cases/get-guest-orders.use-case.js';
import { GetGuestOrdersUseCase } from '../../application/use-cases/get-guest-orders.use-case.js';
import { registerGuestOrderQueryRoutes } from '../guest-order-query.controller.js';

const TEST_JWT_SECRET_KEY = 'super-secret-jwt-key-minimum-32-chars-long!';

const signTestGuestToken = (
  app: FastifyInstance,
  payload: Record<string, unknown>
): string => {
  return app.jwt.sign(
    payload as unknown as Parameters<FastifyInstance['jwt']['sign']>[0]
  );
};

class MockGetGuestOrdersUseCase {
  public mockOrders: OrderResponse[] = [];

  public execute = async ({
    hotelId,
    stayId,
  }: GetGuestOrdersQuery): Promise<OrderResponse[]> => {
    return this.mockOrders
      .filter(
        (order) =>
          (order as { hotelId?: string }).hotelId === hotelId && order.stayId === stayId
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  };

  public getOrderDetail = async ({
    hotelId,
    stayId,
    orderId,
  }: GetGuestOrderDetailQuery): Promise<OrderResponse> => {
    const foundOrder = this.mockOrders.find(
      (order) =>
        (order as { hotelId?: string }).hotelId === hotelId &&
        order.stayId === stayId &&
        order.id === orderId
    );
    if (!foundOrder) {
      throw new NotFoundError('Order');
    }
    return foundOrder;
  };
}

describe('Guest Order Query Routes (GET /api/v1/guest/orders)', () => {
  let fastifyApp: FastifyInstance;
  let mockUseCase: MockGetGuestOrdersUseCase;

  const HOTEL_ALPHA_ID = 'hotel-alpha-1111';
  const ROOM_101_ID = 'room-101-uuid';
  const STAY_101_ID = 'stay-101-uuid';

  const ROOM_102_ID = 'room-102-uuid';
  const STAY_102_ID = 'stay-102-uuid';

  const orderStay101First: OrderResponse = {
    id: 'ord-stay-101-first',
    number: 1001,
    roomId: ROOM_101_ID,
    roomNumber: '101',
    stayId: STAY_101_ID,
    status: OrderStatus.DELIVERED,
    items: [
      {
        itemId: 'item-coffee-uuid',
        name: 'French Press Coffee',
        quantity: 1,
        unitPrice: 6.0,
      },
    ],
    totalAmount: 6.0,
    cancelReason: null,
    payment: null,
    history: [],
    createdAt: '2026-10-29T08:00:00.000Z',
    updatedAt: '2026-10-29T08:25:00.000Z',
    ...({ hotelId: HOTEL_ALPHA_ID } as unknown as object),
  };

  const orderStay101Second: OrderResponse = {
    id: 'ord-stay-101-second',
    number: 1002,
    roomId: ROOM_101_ID,
    roomNumber: '101',
    stayId: STAY_101_ID,
    status: OrderStatus.IN_PROGRESS,
    items: [
      {
        itemId: 'item-burger-uuid',
        name: 'Grand Angus Burger',
        quantity: 2,
        unitPrice: 22.0,
        notes: 'Extra pickles',
      },
    ],
    totalAmount: 44.0,
    cancelReason: null,
    payment: null,
    history: [],
    createdAt: '2026-10-29T12:00:00.000Z',
    updatedAt: '2026-10-29T12:05:00.000Z',
    ...({ hotelId: HOTEL_ALPHA_ID } as unknown as object),
  };

  const orderStay102OtherRoom: OrderResponse = {
    id: 'ord-stay-102-other',
    number: 1003,
    roomId: ROOM_102_ID,
    roomNumber: '102',
    stayId: STAY_102_ID,
    status: OrderStatus.PENDING,
    items: [
      {
        itemId: 'item-salad-uuid',
        name: 'Greek Salad',
        quantity: 1,
        unitPrice: 14.0,
      },
    ],
    totalAmount: 14.0,
    cancelReason: null,
    payment: null,
    history: [],
    createdAt: '2026-10-29T12:10:00.000Z',
    updatedAt: '2026-10-29T12:10:00.000Z',
    ...({ hotelId: HOTEL_ALPHA_ID } as unknown as object),
  };

  beforeEach(async () => {
    fastifyApp = Fastify();
    await fastifyApp.register(fastifyJwt, { secret: TEST_JWT_SECRET_KEY });
    registerErrorHandler(fastifyApp);

    mockUseCase = new MockGetGuestOrdersUseCase();
    mockUseCase.mockOrders = [
      orderStay101First,
      orderStay101Second,
      orderStay102OtherRoom,
    ];

    await fastifyApp.register(
      async (api) => {
        registerGuestOrderQueryRoutes(api, {
          getGuestOrdersUseCase: mockUseCase as unknown as GetGuestOrdersUseCase,
        });
      },
      { prefix: '/api/v1' }
    );

    await fastifyApp.ready();
  });

  afterEach(async () => {
    await fastifyApp.close();
  });

  const createGuestToken = (
    stayId = STAY_101_ID,
    roomId = ROOM_101_ID,
    roomNumber = '101'
  ): string => {
    return signTestGuestToken(fastifyApp, {
      type: 'guest',
      hotelId: HOTEL_ALPHA_ID,
      roomId,
      roomNumber,
      stayId,
      sessionId: `sess-${stayId}`,
    });
  };

  describe('Authentication & Security', () => {
    it('returns HTTP 401 when GET /guest/orders lacks Authorization header', async () => {
      const response = await fastifyApp.inject({
        method: 'GET',
        url: '/api/v1/guest/orders',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.message).toContain('Missing Authorization header');
    });

    it('returns HTTP 401 when GET /guest/orders/:orderId lacks Authorization header', async () => {
      const response = await fastifyApp.inject({
        method: 'GET',
        url: '/api/v1/guest/orders/ord-stay-101-first',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.message).toContain('Missing Authorization header');
    });
  });

  describe('GET /api/v1/guest/orders (List Orders for Stay)', () => {
    it('returns orders for the current stay sorted newest first', async () => {
      const token = createGuestToken();

      const response = await fastifyApp.inject({
        method: 'GET',
        url: '/api/v1/guest/orders',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const orders = response.json() as OrderResponse[];

      expect(orders).toHaveLength(2);
      expect(orders[0]?.id).toBe('ord-stay-101-second'); // 12:00Z first
      expect(orders[1]?.id).toBe('ord-stay-101-first'); // 08:00Z second
      expect(orders[0]?.items[0]?.name).toBe('Grand Angus Burger');
      expect(orders[0]?.totalAmount).toBe(44.0);
    });

    it('returns empty array when the guest stay has placed no orders', async () => {
      const tokenForNewGuest = createGuestToken('stay-empty', 'room-505', '505');

      const response = await fastifyApp.inject({
        method: 'GET',
        url: '/api/v1/guest/orders',
        headers: { authorization: `Bearer ${tokenForNewGuest}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });
  });

  describe('GET /api/v1/guest/orders/:orderId (Order Detail & Tracking)', () => {
    it('returns order details when order belongs to active stay', async () => {
      const token = createGuestToken();

      const response = await fastifyApp.inject({
        method: 'GET',
        url: '/api/v1/guest/orders/ord-stay-101-second',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const order = response.json() as OrderResponse;
      expect(order.id).toBe('ord-stay-101-second');
      expect(order.number).toBe(1002);
      expect(order.roomNumber).toBe('101');
      expect(order.status).toBe(OrderStatus.IN_PROGRESS);
      expect(order.totalAmount).toBe(44.0);
      expect(order.items).toHaveLength(1);
    });

    it('returns HTTP 404 if order belongs to a different room/stay in same hotel', async () => {
      const tokenStay101 = createGuestToken(STAY_101_ID);

      // Attempting to access order from stay 102 (Room 102)
      const response = await fastifyApp.inject({
        method: 'GET',
        url: '/api/v1/guest/orders/ord-stay-102-other',
        headers: { authorization: `Bearer ${tokenStay101}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns HTTP 404 if order ID does not exist', async () => {
      const token = createGuestToken();

      const response = await fastifyApp.inject({
        method: 'GET',
        url: '/api/v1/guest/orders/ord-nonexistent-id',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
