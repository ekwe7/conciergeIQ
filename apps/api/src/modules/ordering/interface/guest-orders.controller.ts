/**
 * WHAT IT DOES:
 * HTTP controller and Fastify route registration for guest in-room dining order placement:
 * - `POST /api/v1/guest/orders`: Places an order and records outbox events in a single transaction.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Protected by `requireGuestSession`: enforces valid guest JWT session and sliding-window rate limiting.
 * - Multi-tenant isolation: extracts `hotelId`, `roomId`, `roomNumber`, and `stayId` directly from verified session claims.
 * - Validates request body with `CreateOrderSchema` from `@conciergeiq/contracts`.
 * - Supports idempotency keys via `Idempotency-Key` or `X-Idempotency-Key` headers.
 * - Returns HTTP 201 Created with authoritative server-calculated monetary totals and order ID.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import { CreateOrderSchema, type CreateOrderInput } from '@conciergeiq/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { toMajorUnits } from '../../../shared/domain/money.js';
import { parseInput } from '../../../shared/http/validation.js';
import { requireGuestSession } from '../../../shared/http/guards/require-guest-session.js';
import type { PlaceOrderUseCase } from '../application/place-order.use-case.js';

export class GuestOrdersController {
  constructor(private readonly placeOrderUseCase: PlaceOrderUseCase) {}

  /**
   * Handles `POST /guest/orders` request.
   */
  public placeOrder = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const validatedOrderInput = parseInput(
      CreateOrderSchema,
      request.body
    ) as CreateOrderInput;

    const guestSessionContext = request.guestSession;
    const rawIdempotencyHeader =
      (request.headers['idempotency-key'] as string | undefined) ??
      (request.headers['x-idempotency-key'] as string | undefined);
    const idempotencyKey = rawIdempotencyHeader?.trim() || undefined;

    const placedOrder = await this.placeOrderUseCase.execute({
      hotelId: guestSessionContext.hotelId,
      roomId: guestSessionContext.roomId,
      roomNumber: guestSessionContext.roomNumber,
      stayId: guestSessionContext.stayId,
      items: validatedOrderInput.items,
      idempotencyKey,
    });

    const responsePayload = {
      id: placedOrder.id,
      orderId: placedOrder.id,
      number: placedOrder.number,
      orderNumber: placedOrder.number,
      hotelId: placedOrder.hotelId,
      roomId: placedOrder.roomId,
      roomNumber: placedOrder.roomNumber,
      stayId: placedOrder.stayId,
      status: placedOrder.status,
      items: placedOrder.items.map((orderItem) => ({
        itemId: orderItem.itemId,
        name: orderItem.name,
        quantity: orderItem.quantity,
        unitPrice: toMajorUnits(orderItem.unitPriceMinor),
        notes: orderItem.notes,
      })),
      totalAmount: placedOrder.totalAmount,
      totalMinor: placedOrder.totalMinor,
      createdAt: placedOrder.createdAt.toISOString(),
      updatedAt: placedOrder.updatedAt.toISOString(),
    };

    return reply.status(201).send(responsePayload);
  };
}

export interface GuestOrdersRoutesDeps {
  readonly placeOrderUseCase: PlaceOrderUseCase;
}

/**
 * Registers guest order placement routes on the Fastify instance.
 */
export const registerGuestOrdersRoutes = (
  fastifyInstance: FastifyInstance,
  { placeOrderUseCase }: GuestOrdersRoutesDeps
): void => {
  const guestOrdersController = new GuestOrdersController(placeOrderUseCase);

  fastifyInstance.post(
    '/guest/orders',
    {
      schema: {
        tags: ['Guest Orders'],
        description: 'Places a new guest room order within an atomic database transaction',
      },
      preHandler: [requireGuestSession],
    },
    guestOrdersController.placeOrder
  );
};
