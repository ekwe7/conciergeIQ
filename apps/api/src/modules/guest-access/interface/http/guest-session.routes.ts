/**
 * WHAT IT DOES:
 * Registers HTTP endpoints for guest access:
 * - `POST /guest/sessions` (resolves to `/api/v1/guest/sessions`)
 * - `GET /guest/sessions/me` (resolves to `/api/v1/guest/sessions/me`)
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Publicly accessible endpoint where hotel guests scanning a room QR code exchange
 *   their token for an authorized session.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import type { FastifyInstance } from 'fastify';
import type { GuestSessionService } from '../../application/guest-session.service.js';
import { GuestSessionController } from './guest-session.controller.js';

export interface GuestRoutesDependencies {
  readonly guestSessionService: GuestSessionService;
}

export const registerGuestRoutes = (
  apiInstance: FastifyInstance,
  { guestSessionService }: GuestRoutesDependencies
): void => {
  const guestController = new GuestSessionController(guestSessionService);

  apiInstance.post(
    '/guest/sessions',
    {
      schema: {
        tags: ['Guest Access'],
        description: 'Resolves a room QR token into an active guest session',
      },
    },
    guestController.resolveSession
  );

  apiInstance.get(
    '/guest/sessions/me',
    {
      schema: {
        tags: ['Guest Access'],
        description: 'Verifies the validity of the current guest session',
      },
    },
    guestController.getSessionMe
  );
};
