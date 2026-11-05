/**
 * WHAT IT DOES:
 * Fastify HTTP controller and route registration for guest-facing order querying and tracking:
 * - `GET /api/v1/guest/orders`: Lists all orders placed during the active guest stay (newest first).
 * - `GET /api/v1/guest/orders/:orderId`: Retrieves specific order details and tracking status.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Security & Isolation: Enforces `requireGuestSession` guard, deriving `hotelId` and `stayId` directly
 *   from verified session token claims.
 * - Stay Boundary Protection: Rejects any attempt to view orders belonging to another room or another stay
 *   with HTTP 404 (preventing order existence discovery).
 * - Schema Validation: Validates route parameters using Zod schemas.
 * - Strict Compliance: Returns responses matching `OrderResponse` from `@conciergeiq/contracts`.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseInput } from '../../../shared/http/validation.js';
import { requireGuestSession } from '../../../shared/http/guards/require-guest-session.js';
import type { GetGuestOrdersUseCase } from '../application/use-cases/get-guest-orders.use-case.js';

const OrderParamsSchema = z.object({
  orderId: z.string().trim().min(1, 'Order ID must not be empty'),
});

export class GuestOrderQueryController {
  constructor(private readonly getGuestOrdersUseCase: GetGuestOrdersUseCase) {}

  /**
   * Handles `GET /guest/orders` request.
   */
  public listOrders = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const { hotelId, stayId } = request.guestSession;

    const guestOrdersList = await this.getGuestOrdersUseCase.execute({
      hotelId,
      stayId,
    });

    return reply.status(200).send(guestOrdersList);
  };

  /**
   * Handles `GET /guest/orders/:orderId` request.
   */
  public getOrderDetail = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const { orderId } = parseInput(OrderParamsSchema, request.params);
    const { hotelId, stayId } = request.guestSession;

    const orderDetailResponse = await this.getGuestOrdersUseCase.getOrderDetail({
      hotelId,
      stayId,
      orderId,
    });

    return reply.status(200).send(orderDetailResponse);
  };
}

export interface GuestOrderQueryRoutesDeps {
  readonly getGuestOrdersUseCase: GetGuestOrdersUseCase;
}

/**
 * Registers guest order query routes on the Fastify instance.
 */
export const registerGuestOrderQueryRoutes = (
  fastifyInstance: FastifyInstance,
  { getGuestOrdersUseCase }: GuestOrderQueryRoutesDeps
): void => {
  const queryController = new GuestOrderQueryController(getGuestOrdersUseCase);

  fastifyInstance.get(
    '/guest/orders',
    {
      schema: {
        tags: ['Guest Orders'],
        description: 'Lists all active and historical orders for the current guest stay',
      },
      preHandler: [requireGuestSession],
    },
    queryController.listOrders
  );

  fastifyInstance.get(
    '/guest/orders/:orderId',
    {
      schema: {
        tags: ['Guest Orders'],
        description: 'Retrieves tracking details and status for a specific guest order',
      },
      preHandler: [requireGuestSession],
    },
    queryController.getOrderDetail
  );
};
