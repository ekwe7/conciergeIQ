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
  app.get(
    '/ws/staff',
    {
      websocket: true,
      preValidation: async (request, reply) => {
        let token: string | undefined;

        const authHeader = request.headers.authorization;
        if (typeof authHeader === 'string' && authHeader.trim().startsWith('Bearer ')) {
          token = authHeader.trim().substring(7).trim();
        }

        if (!token && request.query && typeof request.query === 'object') {
          const query = request.query as Record<string, unknown>;
          if (typeof query.accessToken === 'string' && query.accessToken.trim().length > 0) {
            token = query.accessToken.trim();
          } else if (typeof query.token === 'string' && query.token.trim().length > 0) {
            token = query.token.trim();
          }
        }

        if (!token) {
          return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Missing staff access token',
          });
        }
      },
    },
    async (socket, request) => {
      let accessToken: string | undefined;

      const authHeader = request.headers.authorization;
      if (typeof authHeader === 'string' && authHeader.trim().startsWith('Bearer ')) {
        accessToken = authHeader.trim().substring(7).trim();
      }

      if (!accessToken) {
        const query = ConnectQuerySchema.safeParse(request.query);
        if (query.success) {
          accessToken = query.data.accessToken;
        }
      }

      const staff = accessToken ? await deps.staffFromAccessToken(accessToken) : undefined;
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

      setImmediate(() => {
        try {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify(connected));
          }
        } catch {
          // ignore
        }
      });
    }
  );
}
