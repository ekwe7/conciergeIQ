import type { GuestConnectedMessage } from '@conciergeiq/contracts';
import type { FastifyInstance } from 'fastify';
import { decodeAndVerifyGuestToken, type AuthenticatedGuestSession } from '../../../shared/http/guards/require-guest-session.js';
import type { Clock } from '../../../shared/utils/clock.js';
import type { ConnectionManager } from '../connection-manager.js';

export interface GuestGatewayDeps {
  connectionManager: ConnectionManager;
  clock: Clock;
}

/**
 * Registers the /ws/guest endpoint.
 *
 * Handshake requests are authenticated via:
 * - `Authorization: Bearer <token>` header, or
 * - `token`, `accessToken`, or `sessionToken` query parameters.
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

        // Attach verified guest session for the WebSocket handler
        request.guestSession = guestSession;
      },
    },
    async (socket, request) => {
      const guestSession = request.guestSession as AuthenticatedGuestSession | undefined;
      if (!guestSession) {
        socket.close(1008, 'Unauthorized');
        return;
      }

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
          }
        } catch {
          // ignore if socket closed immediately
        }
      });
    }
  );
}
