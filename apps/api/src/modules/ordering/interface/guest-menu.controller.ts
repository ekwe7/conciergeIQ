/**
 * WHAT IT DOES:
 * HTTP controller and route registration for guest-facing menu browsing:
 * - `GET /api/v1/guest/menu`: Returns categorized menu items for the guest's hotel.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Enforces `requireGuestSession` pre-handler guard, ensuring requests originate
 *   from an active, checked-in hotel stay and are rate-limited to 60 req/min.
 * - Restricts catalog querying to `request.guestSession.hotelId`, preventing cross-hotel data leaks.
 * - Returns HTTP 200 with `GetMenuResponse` containing categories, items, prices, and stock flags.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireGuestSession } from '../../../shared/http/guards/require-guest-session.js';
import type { GetGuestMenuUseCase } from '../application/use-cases/get-guest-menu.use-case.js';

export class GuestMenuController {
  constructor(private readonly getGuestMenuUseCase: GetGuestMenuUseCase) {}

  /**
   * Handles `GET /guest/menu` request.
   */
  public getMenu = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const authenticatedGuestHotelId = request.guestSession.hotelId;

    const guestMenuResponse = await this.getGuestMenuUseCase.execute({
      hotelId: authenticatedGuestHotelId,
    });

    return reply.status(200).send(guestMenuResponse);
  };
}

export interface GuestMenuRoutesDeps {
  readonly getGuestMenuUseCase: GetGuestMenuUseCase;
}

/**
 * Registers guest menu routes on the Fastify instance.
 */
export const registerGuestMenuRoutes = (
  fastifyInstance: FastifyInstance,
  { getGuestMenuUseCase }: GuestMenuRoutesDeps
): void => {
  const guestMenuController = new GuestMenuController(getGuestMenuUseCase);

  fastifyInstance.get(
    '/guest/menu',
    {
      schema: {
        tags: ['Guest Menu'],
        description: 'Retrieves categorized menu catalog for the current guest stay',
      },
      preHandler: [requireGuestSession],
    },
    guestMenuController.getMenu
  );
};
