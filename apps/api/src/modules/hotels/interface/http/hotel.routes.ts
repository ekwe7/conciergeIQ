import { UpdateBrandingSchema, UpdateHotelSchema, UploadLogoSchema } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type { Clock } from '../../../../shared/utils/clock.js';
import { parseInput } from '../../../../shared/http/validation.js';
import { Permission, type AuthGuards } from '../../../identity/index.js';
import type { HotelsService } from '../../application/hotels.service.js';

const HotelParamsSchema = z.object({ hotelId: z.string().uuid() });

/**
 * `/hotel` is the signed-in staff member's own hotel; there is no way to
 * address another one. `/hotels/:hotelId/branding` and `/logo` are public:
 * the guest app shows them before and after the QR scan, and they hold
 * nothing secret.
 */
export function registerHotelRoutes(app: FastifyInstance, hotels: HotelsService, guards: AuthGuards, clock: Clock): void {
  const tags = ['Hotel'];
  const canManage = { schema: { tags }, preHandler: guards.requirePermission(Permission.MANAGE_HOTEL_SETTINGS) };

  app.get('/hotel', { schema: { tags }, preHandler: guards.signedIn }, async (request) => {
    return hotels.get(request.staff.hotelId);
  });

  app.patch('/hotel', canManage, async (request) => {
    return hotels.update(request.staff.hotelId, parseInput(UpdateHotelSchema, request.body));
  });

  app.get('/hotel/branding', { schema: { tags }, preHandler: guards.signedIn }, async (request) =>
    hotels.getBranding(request.staff.hotelId),
  );

  app.patch('/hotel/branding', canManage, async (request) =>
    hotels.updateBranding(request.staff.hotelId, parseInput(UpdateBrandingSchema, request.body)),
  );

  app.put('/hotel/logo', { ...canManage, bodyLimit: 512 * 1024 }, async (request) =>
    hotels.setLogo(request.staff.hotelId, parseInput(UploadLogoSchema, request.body), clock.now()),
  );

  app.delete('/hotel/logo', canManage, async (request) => hotels.removeLogo(request.staff.hotelId));

  app.get('/hotels/:hotelId/branding', { schema: { tags } }, async (request, reply) => {
    const { hotelId } = parseInput(HotelParamsSchema, request.params);
    reply.header('Cache-Control', 'public, max-age=60');
    return hotels.getBranding(hotelId);
  });

  app.get('/hotels/:hotelId/logo', { schema: { tags } }, async (request, reply) => {
    const { hotelId } = parseInput(HotelParamsSchema, request.params);
    const logo = await hotels.getLogo(hotelId);
    if (!logo) throw new NotFoundError('Logo');
    return reply
      .header('Content-Type', logo.contentType)
      // The URL changes with every upload (?v=), so the file can be cached for a long time.
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      // Even if an SVG slipped through, nothing in it can run or load anything.
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(logo.bytes);
  });
}
