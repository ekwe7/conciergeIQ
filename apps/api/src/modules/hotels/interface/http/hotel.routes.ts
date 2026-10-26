import { UpdateHotelSchema } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../../../shared/http/validation.js';
import { Permission, type AuthGuards } from '../../../identity/index.js';
import type { HotelsService } from '../../application/hotels.service.js';

/** The signed-in staff member's own hotel. There is no way to address another hotel. */
export function registerHotelRoutes(app: FastifyInstance, hotels: HotelsService, guards: AuthGuards): void {
  app.get('/hotel', { schema: { tags: ['Hotel'] }, preHandler: guards.signedIn }, async (request) => {
    return hotels.get(request.staff.hotelId);
  });

  app.patch(
    '/hotel',
    { schema: { tags: ['Hotel'] }, preHandler: guards.requirePermission(Permission.MANAGE_HOTEL_SETTINGS) },
    async (request) => {
      return hotels.update(request.staff.hotelId, parseInput(UpdateHotelSchema, request.body));
    },
  );
}
