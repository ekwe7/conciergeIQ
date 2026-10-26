import type { StaffWSMessage } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Clock } from '../../../shared/utils/clock.js';
import type { SignedInStaff } from '../../identity/index.js';
import type { StaffConnections } from '../application/staff-connections.js';

const ConnectQuerySchema = z.object({ accessToken: z.string().min(1) });

/** Closed with this code when the access token is missing, invalid or belongs to an inactive user. */
export const UNAUTHORIZED_CLOSE_CODE = 4401;

export interface StaffGatewayDeps {
  connections: StaffConnections;
  clock: Clock;
  staffFromAccessToken(token: string): Promise<SignedInStaff | undefined>;
}

/**
 * `/ws/staff?accessToken=...` (browsers cannot set headers on a WebSocket).
 * A connection only ever receives events for the signed-in user's hotel.
 */
export function registerStaffGateway(app: FastifyInstance, deps: StaffGatewayDeps): void {
  app.get('/ws/staff', { websocket: true }, async (socket, request) => {
    const query = ConnectQuerySchema.safeParse(request.query);
    const staff = query.success ? await deps.staffFromAccessToken(query.data.accessToken) : undefined;
    if (!staff) {
      socket.close(UNAUTHORIZED_CLOSE_CODE, 'Unauthorized');
      return;
    }

    const remove = deps.connections.add(staff.hotelId, staff.id, socket);
    socket.on('close', remove);

    const connected: StaffWSMessage = {
      type: 'STAFF_CONNECTED',
      payload: { userId: staff.id, hotelId: staff.hotelId, serverTime: deps.clock.now().toISOString() },
    };
    socket.send(JSON.stringify(connected));
  });
}
