import { CheckInSchema } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../../../../shared/http/validation.js';
import { Permission, type AuthGuards } from '../../../identity/index.js';
import type { StaysService } from '../../application/stays.service.js';

const RoomParamsSchema = z.object({ roomId: z.string().uuid() });
const StayParamsSchema = z.object({ stayId: z.string().uuid() });

export function registerStaysRoutes(app: FastifyInstance, stays: StaysService, guards: AuthGuards): void {
  const tags = ['Stays'];
  const canView = { schema: { tags }, preHandler: guards.requirePermission(Permission.VIEW_ROOMS) };
  const canCheckGuestsInAndOut = {
    schema: { tags },
    preHandler: guards.requirePermission(Permission.CHECK_GUESTS_IN_AND_OUT),
  };

  app.get('/stays', canView, async (request) => stays.listActive(request.staff.hotelId));

  app.get('/stays/:stayId', canView, async (request) => {
    const { stayId } = parseInput(StayParamsSchema, request.params);
    return stays.get(request.staff.hotelId, stayId);
  });

  app.get('/stays/:stayId/bill', canView, async (request) => {
    const { stayId } = parseInput(StayParamsSchema, request.params);
    return stays.bill(request.staff.hotelId, stayId);
  });

  app.post('/rooms/:roomId/check-in', canCheckGuestsInAndOut, async (request, reply) => {
    const { roomId } = parseInput(RoomParamsSchema, request.params);
    const stay = await stays.checkIn(request.staff, roomId, parseInput(CheckInSchema, request.body));
    return reply.status(201).send(stay);
  });

  app.post('/stays/:stayId/check-out', canCheckGuestsInAndOut, async (request) => {
    const { stayId } = parseInput(StayParamsSchema, request.params);
    return stays.checkOut(request.staff, stayId);
  });
}
