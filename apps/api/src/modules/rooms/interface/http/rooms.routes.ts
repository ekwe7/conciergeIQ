import {
  CreateRoomSchema,
  CreateRoomsInBulkSchema,
  ListRoomsQuerySchema,
  RegenerateQrCodesSchema,
  UpdateRoomSchema,
} from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../../../../shared/http/validation.js';
import { Permission, type AuthGuards } from '../../../identity/index.js';
import type { RoomsService } from '../../application/rooms.service.js';
import { renderQrCodePdf } from '../../infrastructure/qr-code-pdf.js';

const RoomParamsSchema = z.object({ roomId: z.string().uuid() });

export interface RoomsRoutesDeps {
  rooms: RoomsService;
  guards: AuthGuards;
  /** The hotel name printed on the QR cards. */
  hotelNameOf(hotelId: string): Promise<string>;
}

export function registerRoomsRoutes(app: FastifyInstance, { rooms, guards, hotelNameOf }: RoomsRoutesDeps): void {
  const canView = { schema: { tags: ['Rooms'] }, preHandler: guards.requirePermission(Permission.VIEW_ROOMS) };
  const canManage = {
    schema: { tags: ['Rooms'] },
    preHandler: guards.requirePermission(Permission.MANAGE_ROOMS_AND_QR_CODES),
  };

  app.get('/rooms', canView, async (request) => {
    const { floor } = parseInput(ListRoomsQuerySchema, request.query);
    return rooms.list(request.staff.hotelId, { floor });
  });

  app.post('/rooms', canManage, async (request, reply) => {
    const [room] = await rooms.create(request.staff.hotelId, [parseInput(CreateRoomSchema, request.body)]);
    return reply.status(201).send(room);
  });

  app.post('/rooms/bulk', canManage, async (request, reply) => {
    const input = parseInput(CreateRoomsInBulkSchema, request.body);
    return reply.status(201).send(await rooms.create(request.staff.hotelId, input.rooms));
  });

  app.patch('/rooms/:roomId', canManage, async (request) => {
    const { roomId } = parseInput(RoomParamsSchema, request.params);
    return rooms.update(request.staff.hotelId, roomId, parseInput(UpdateRoomSchema, request.body));
  });

  app.post('/rooms/:roomId/qr/regenerate', canManage, async (request) => {
    const { roomId } = parseInput(RoomParamsSchema, request.params);
    const [room] = await rooms.regenerateQrCodes(request.staff, [roomId]);
    return room;
  });

  app.post('/rooms/qr/regenerate', canManage, async (request) => {
    const { roomIds } = parseInput(RegenerateQrCodesSchema, request.body);
    return rooms.regenerateQrCodes(request.staff, roomIds);
  });

  app.get('/rooms/qr.pdf', canManage, async (request, reply) => {
    const { floor } = parseInput(ListRoomsQuerySchema, request.query);
    const { hotelId } = request.staff;
    const cards = (await rooms.list(hotelId, { floor })).map((room) => ({ roomNumber: room.number, qrUrl: room.qrUrl }));
    const pdf = await renderQrCodePdf(await hotelNameOf(hotelId), cards);

    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', 'attachment; filename="room-qr-codes.pdf"')
      .send(pdf);
  });
}
