import type { GuestConnectedMessage } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { decodeAndVerifyGuestToken, type AuthenticatedGuestSession } from '../../../shared/http/guards/require-guest-session.js';
import type { Clock } from '../../../shared/utils/clock.js';
import type { ChannelAuthorizer } from '../channel-authorizer.js';
import type { ConnectionManager } from '../connection-manager.js';
import type { EventReplayBuffer } from '../event-replay-buffer.js';

export interface GuestGatewayDeps {
  connectionManager: ConnectionManager;
  clock: Clock;
  channelAuthorizer?: ChannelAuthorizer;
  replayBuffer?: EventReplayBuffer;
}

declare module 'fastify' {
  interface FastifyRequest {
    lastEventId?: string;
  }
}

/**
 * Registers the /ws/guest endpoint.
 *
 * Handshake requests are authenticated via:
 * - `Authorization: Bearer <token>` header, or
 * - `token`, `accessToken`, or `sessionToken` query parameters.
 *
 * Supports missed event recovery on reconnection via `Last-Event-ID` header
 * or `lastEventId` / `last_event_id` query parameters.
 *
 * Unauthenticated handshakes are strictly rejected with HTTP 401 before establishing
 * the WebSocket connection.
 */
export function registerGuestGateway(app: FastifyInstance, deps: GuestGatewayDeps): void {
  app.get(
    '/ws/guest',
    {
      websocket: true,
      preValidation: async (request, reply) => {
        let token: string | undefined;

        // 1. Check Authorization header
        const authHeader = request.headers.authorization;
        if (typeof authHeader === 'string' && authHeader.trim().startsWith('Bearer ')) {
          token = authHeader.trim().substring(7).trim();
        }

        // 2. Check query parameters
        if (!token && request.query && typeof request.query === 'object') {
          const query = request.query as Record<string, unknown>;
          if (typeof query.token === 'string') token = query.token;
          else if (typeof query.accessToken === 'string') token = query.accessToken;
          else if (typeof query.sessionToken === 'string') token = query.sessionToken;
        }

        if (!token) {
          return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Missing guest session token',
          });
        }

        const guestSession = decodeAndVerifyGuestToken(token, request.server.jwt);
        if (!guestSession) {
          return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Invalid or expired guest session token',
          });
        }

        // 3. Extract optional Last-Event-ID for reconnection recovery
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

        request.guestSession = guestSession;
        request.lastEventId = lastEventId;
      },
    },
    async (socket, request) => {
      const guestSession = request.guestSession as AuthenticatedGuestSession | undefined;
      if (!guestSession) {
        socket.close(1008, 'Unauthorized');
        return;
      }

      const roomChannel = `room:${guestSession.hotelId}:${guestSession.roomId}`;
      const remove = deps.connectionManager.register(socket, {
        clientType: 'guest',
        hotelId: guestSession.hotelId,
        sessionId: guestSession.sessionId,
        roomId: guestSession.roomId,
        roomNumber: guestSession.roomNumber,
        stayId: guestSession.stayId,
        guestName: guestSession.guestName,
      });

      socket.on('close', remove);

      const connected: GuestConnectedMessage = {
        type: 'GUEST_CONNECTED',
        payload: {
          sessionId: guestSession.sessionId,
          roomNumber: guestSession.roomNumber,
          serverTime: deps.clock.now().toISOString(),
        },
      };

      setImmediate(() => {
        try {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify(connected));

            // Replay missed events since Last-Event-ID if available
            if (request.lastEventId && deps.replayBuffer) {
              const missed = deps.replayBuffer.getMissedEvents(roomChannel, request.lastEventId);
              for (const entry of missed) {
                const messageWithId = { ...(entry.data as Record<string, unknown>), eventId: entry.eventId };
                socket.send(JSON.stringify(messageWithId));
              }
            }
          }
        } catch {
          // ignore if socket closed immediately
        }
      });

      // Handle client messages (channel subscription requests)
      socket.on('message', (rawData) => {
        try {
          const data = JSON.parse(rawData.toString());
          if (data && typeof data === 'object') {
            if (data.type === 'SUBSCRIBE' && typeof data.channel === 'string') {
              const meta = deps.connectionManager.getMetadata(socket);
              const isAuthorized = meta && deps.channelAuthorizer
                ? deps.channelAuthorizer.authorize(meta, data.channel)
                : false;

              if (isAuthorized) {
                deps.connectionManager.subscribe(socket, data.channel);
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
              deps.connectionManager.unsubscribe(socket, data.channel);
              socket.send(JSON.stringify({ type: 'UNSUBSCRIBED', channel: data.channel }));
            }
          }
        } catch {
          // ignore malformed client messages
        }
      });
    }
  );
}
