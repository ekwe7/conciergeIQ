/**
 * WHAT IT DOES:
 * Route and HTTP injection test suite for `POST /api/v1/guest/orders`.
 * Tests guest session authentication, input validation against contracts,
 * multi-tenant context extraction, server-side pricing, and 201 response formatting.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Employs Fastify `inject` for high-speed, isolated HTTP route verification.
 * - Confirms that unauthenticated requests (missing or invalid Bearer tokens) are blocked at the guard.
 * - Asserts that malformed payloads (empty items, invalid UUIDs, invalid quantities) return HTTP 400.
 * - Validates that authenticated guests receive HTTP 201 with authoritative server totals.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerErrorHandler } from '../../../../shared/http/error-handler.js';
import { Order } from '../../domain/order.aggregate.js';
import { OrderStatus } from '../../domain/order-status.js';
import type { PlaceOrderCommand } from '../../application/place-order.use-case.js';
import { PlaceOrderUseCase } from '../../application/place-order.use-case.js';
import { registerGuestOrdersRoutes } from '../guest-orders.controller.js';

const TEST_JWT_SECRET_KEY = 'super-secret-jwt-key-minimum-32-chars-long!';

const signTestGuestToken = (
  app: FastifyInstance,
  payload: Record<string, unknown>
): string => {
  return app.jwt.sign(
    payload as unknown as Parameters<FastifyInstance['jwt']['sign']>[0]
  );
};

class MockPlaceOrderUseCase {
  public executedCommands: PlaceOrderCommand[] = [];

  public execute = async (command: PlaceOrderCommand): Promise<Order> => {
    this.executedCommands.push(command);

    return Order.place({
      id: 'ord-test-uuid-999',
      hotelId: command.hotelId,
      number: 1042,
      roomId: command.roomId,
      roomNumber: command.roomNumber,
      stayId: command.stayId,
      items: command.items.map((item) => ({
        itemId: item.itemId,
        name: `Item ${item.itemId}`,
        unitPriceMinor: 3500, // $35.00
        quantity: item.quantity,
        notes: item.notes,
      })),
      idempotencyKey: command.idempotencyKey ?? null,
      createdAt: new Date('2026-10-29T14:00:00.000Z'),
    });
  };
}

describe('Guest Orders Route (POST /api/v1/guest/orders)', () => {
  let fastifyApp: FastifyInstance;
  let mockUseCase: MockPlaceOrderUseCase;

  const SAMPLE_HOTEL_ID = 'hotel-grand-1111';
  const SAMPLE_ROOM_ID = 'room-202-2222';
  const SAMPLE_STAY_ID = 'stay-303-3333';
  const SAMPLE_SESSION_ID = 'sess-404-4444';
  const VALID_ITEM_UUID = 'a0000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    fastifyApp = Fastify();
    await fastifyApp.register(fastifyJwt, { secret: TEST_JWT_SECRET_KEY });
    registerErrorHandler(fastifyApp);

    mockUseCase = new MockPlaceOrderUseCase();

    await fastifyApp.register(
      async (api) => {
        registerGuestOrdersRoutes(api, {
          placeOrderUseCase: mockUseCase as unknown as PlaceOrderUseCase,
        });
      },
      { prefix: '/api/v1' }
    );

    await fastifyApp.ready();
  });

  afterEach(async () => {
    await fastifyApp.close();
  });

  const createGuestSessionToken = (overrides?: Record<string, unknown>): string => {
    return signTestGuestToken(fastifyApp, {
      type: 'guest',
      hotelId: SAMPLE_HOTEL_ID,
      roomId: SAMPLE_ROOM_ID,
      roomNumber: '202',
      stayId: SAMPLE_STAY_ID,
      sessionId: SAMPLE_SESSION_ID,
      ...overrides,
    });
  };

  describe('Authentication & Security', () => {
    it('rejects unauthenticated request lacking Authorization header with HTTP 401', async () => {
      const response = await fastifyApp.inject({
        method: 'POST',
        url: '/api/v1/guest/orders',
        payload: {
          items: [{ itemId: VALID_ITEM_UUID, quantity: 1 }],
        },
      });

      expect(response.statusCode).toBe(401);
      const jsonResponse = response.json();
      expect(jsonResponse.error.message).toContain('Missing Authorization header');
    });

    it('rejects request with invalid or malformed bearer token with HTTP 401', async () => {
      const response = await fastifyApp.inject({
        method: 'POST',
        url: '/api/v1/guest/orders',
        headers: {
          authorization: 'Bearer not-a-valid-jwt-token',
        },
        payload: {
          items: [{ itemId: VALID_ITEM_UUID, quantity: 1 }],
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Input Validation against CreateOrderSchema', () => {
    it('returns HTTP 400 when items array is empty', async () => {
      const token = createGuestSessionToken();

      const response = await fastifyApp.inject({
        method: 'POST',
        url: '/api/v1/guest/orders',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          items: [],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(mockUseCase.executedCommands).toHaveLength(0);
    });

    it('returns HTTP 400 when itemId is not a valid UUID', async () => {
      const token = createGuestSessionToken();

      const response = await fastifyApp.inject({
        method: 'POST',
        url: '/api/v1/guest/orders',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          items: [{ itemId: 'not-a-uuid', quantity: 1 }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(mockUseCase.executedCommands).toHaveLength(0);
    });

    it('returns HTTP 400 when quantity is zero or negative', async () => {
      const token = createGuestSessionToken();

      const response = await fastifyApp.inject({
        method: 'POST',
        url: '/api/v1/guest/orders',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          items: [{ itemId: VALID_ITEM_UUID, quantity: 0 }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(mockUseCase.executedCommands).toHaveLength(0);
    });
  });

  describe('Successful Placement & Response Formatting', () => {
    it('creates order, forwards session claims, and returns HTTP 201 with authoritative totals', async () => {
      const token = createGuestSessionToken();

      const response = await fastifyApp.inject({
        method: 'POST',
        url: '/api/v1/guest/orders',
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': 'idem-unique-key-42',
        },
        payload: {
          items: [
            { itemId: VALID_ITEM_UUID, quantity: 2, notes: 'No cilantro' },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const orderBody = response.json();

      expect(orderBody.id).toBe('ord-test-uuid-999');
      expect(orderBody.orderId).toBe('ord-test-uuid-999');
      expect(orderBody.number).toBe(1042);
      expect(orderBody.hotelId).toBe(SAMPLE_HOTEL_ID);
      expect(orderBody.roomId).toBe(SAMPLE_ROOM_ID);
      expect(orderBody.roomNumber).toBe('202');
      expect(orderBody.stayId).toBe(SAMPLE_STAY_ID);
      expect(orderBody.status).toBe(OrderStatus.PENDING);

      // Server totals: (3500 * 2) = 7000 minor ($70.00)
      expect(orderBody.totalMinor).toBe(7000);
      expect(orderBody.totalAmount).toBe(70.00);
      expect(orderBody.items).toEqual([
        {
          itemId: VALID_ITEM_UUID,
          name: `Item ${VALID_ITEM_UUID}`,
          quantity: 2,
          unitPrice: 35.00,
          notes: 'No cilantro',
        },
      ]);

      // Verify that session context and idempotency key were passed into the use case
      expect(mockUseCase.executedCommands).toHaveLength(1);
      const executedCommand = mockUseCase.executedCommands[0]!;
      expect(executedCommand.hotelId).toBe(SAMPLE_HOTEL_ID);
      expect(executedCommand.roomId).toBe(SAMPLE_ROOM_ID);
      expect(executedCommand.roomNumber).toBe('202');
      expect(executedCommand.stayId).toBe(SAMPLE_STAY_ID);
      expect(executedCommand.idempotencyKey).toBe('idem-unique-key-42');
    });
  });
});
