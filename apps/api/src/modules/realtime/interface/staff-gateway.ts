import type { StaffWSMessage } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Clock } from '../../../shared/utils/clock.js';
import type { SignedInStaff } from '../../identity/index.js';
import type { StaffConnections } from '../application/staff-connections.js';
import type { ChannelAuthorizer } from '../channel-authorizer.js';
import type { EventReplayBuffer } from '../event-replay-buffer.js';

const ConnectQuerySchema = z.object({ accessToken: z.string().min(1) });

/** Closed with this code when the access token is missing, invalid or belongs to an inactive user. */
export const UNAUTHORIZED_CLOSE_CODE = 4401;

export interface StaffGatewayDeps {
  connections: StaffConnections;
  clock: Clock;
  staffFromAccessToken(token: string): Promise<SignedInStaff | undefined>;
  channelAuthorizer?: ChannelAuthorizer;
  replayBuffer?: EventReplayBuffer;
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

        let lastEventId: string | undefined;
        const headerLastEventId = request.headers['last-event-id'];
        if (typeof headerLastEventId === 'string' && headerLastEventId.trim().length > 0) {
          lastEventId = headerLastEventId.trim();
        } else if (request.query && typeof request.query === 'object') {
          const query = request.query as Record<string, unknown>;
          if (typeof query.lastEventId === 'string' && query.lastEventId.trim().length > 0) {
            lastEventId = query.lastEventId.trim();
          } else if (typeof query.last_event_id === 'string' && query.last_event_id.trim().length > 0) {
            lastEventId = query.last_event_id.trim();
          }
        }
        request.lastEventId = lastEventId;
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

            if (request.lastEventId && deps.replayBuffer) {
              const staffChannel = `hotel:${staff.hotelId}:staff`;
              const missed = deps.replayBuffer.getMissedEvents(staffChannel, request.lastEventId);
              for (const entry of missed) {
                const messageWithId = { ...(entry.data as Record<string, unknown>), eventId: entry.eventId };
                socket.send(JSON.stringify(messageWithId));
              }
            }
          }
        } catch {
          // ignore
        }
      });

      // Handle client messages (channel subscription requests)
      socket.on('message', (rawData) => {
        try {
          const data = JSON.parse(rawData.toString());
          if (data && typeof data === 'object') {
            const connectionManager = deps.connections.getConnectionManager();
            if (data.type === 'SUBSCRIBE' && typeof data.channel === 'string') {
              const meta = connectionManager.getMetadata(socket);
              const isAuthorized = meta && deps.channelAuthorizer
                ? deps.channelAuthorizer.authorize(meta, data.channel)
                : false;

              if (isAuthorized) {
                connectionManager.subscribe(socket, data.channel);
                socket.send(JSON.stringify({ type: 'SUBSCRIBED', channel: data.channel }));
              } else {
                socket.send(
                  JSON.stringify({
                    type: 'ERROR',
                    error: 'Forbidden',
                    message: `Unauthorized subscription to channel ${data.channel}`,
                  })
                );
              }
            } else if (data.type === 'UNSUBSCRIBE' && typeof data.channel === 'string') {
              connectionManager.unsubscribe(socket, data.channel);
              socket.send(JSON.stringify({ type: 'UNSUBSCRIBED', channel: data.channel }));
            }
          }
        } catch {
          // ignore
        }
      });
    }
  );
}
