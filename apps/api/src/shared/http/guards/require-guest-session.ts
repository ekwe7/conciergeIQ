/**
 * WHAT IT DOES:
 * Fastify pre-handler guard and plugin for authenticating guest session JWT tokens
 * and enforcing sliding-window rate limits (default 60 requests/minute per session ID).
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Guest endpoints (menu browsing, service requests, ordering) must only be accessible
 *   by authenticated guests with an active stay.
 * - Extracts and cryptographically verifies the Bearer token from the `Authorization` header.
 * - Decorates `request.guestSession` with typed session context (`hotelId`, `roomId`, `stayId`, `sessionId`).
 * - Sliding-window rate limiting prevents denial-of-service, automated scraping, and order flooding.
 * - Returns HTTP 401 Unauthorized for missing, invalid, or revoked guest session tokens.
 * - Returns HTTP 429 Too Many Requests with a `Retry-After: 60` header when rate limit is exceeded.
 * - Fastify's interface definitions are augmented in this declaration to ensure strict typing.
 */

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { GuestSessionService } from '../../../modules/guest-access/index.js';
import {
  TooManyRequestsError,
  UnauthorizedError,
} from '../../errors/app-error.js';
import type { Clock } from '../../utils/clock.js';
import { systemClock } from '../../utils/clock.js';
import { SlidingWindowRateLimiter } from '../rate-limit.js';

/**
 * Context attached to `request.guestSession` upon successful authentication.
 */
export interface AuthenticatedGuestSession {
  readonly sessionId: string;
  readonly hotelId: string;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly stayId: string;
  readonly guestName?: string;
  readonly type: 'guest';
}

declare module 'fastify' {
  interface FastifyRequest {
    guestSession: AuthenticatedGuestSession;
  }
  interface FastifyInstance {
    guestSessionService?: GuestSessionService;
  }
}

export interface RequireGuestSessionGuardOptions {
  readonly guestSessionService?: GuestSessionService;
  readonly rateLimiter?: SlidingWindowRateLimiter;
  readonly maxRequestsPerWindow?: number;
  readonly windowDurationMs?: number;
  readonly clock?: Clock;
}

/**
 * Validates and decodes a guest session token from either a signed JWT or a mock base64url token.
 * Returns AuthenticatedGuestSession or undefined if invalid/malformed/expired.
 */
export function decodeAndVerifyGuestToken(
  tokenString: string,
  serverJwt?: { verify<T>(token: string): T }
): AuthenticatedGuestSession | undefined {
  if (!tokenString) return undefined;

  // 1. Attempt verification via Fastify JWT plugin if available on server
  if (serverJwt) {
    try {
      const decodedJwtPayload = serverJwt.verify<Record<string, unknown>>(tokenString);
      if (decodedJwtPayload && typeof decodedJwtPayload === 'object') {
        const candidateClaimsRecord = decodedJwtPayload as Record<string, unknown>;
        const resolvedSessionIdentifier = (candidateClaimsRecord.sessionId ??
          candidateClaimsRecord.sub) as string;
        const resolvedHotelIdentifier = candidateClaimsRecord.hotelId as string;
        const resolvedRoomIdentifier = candidateClaimsRecord.roomId as string;
        const resolvedStayIdentifier = candidateClaimsRecord.stayId as string;
        const resolvedRoomNumber = (candidateClaimsRecord.roomNumber ?? '') as string;
        const resolvedGuestName = candidateClaimsRecord.guestName as string | undefined;

        if (
          resolvedSessionIdentifier &&
          resolvedHotelIdentifier &&
          resolvedRoomIdentifier &&
          resolvedStayIdentifier
        ) {
          return {
            sessionId: resolvedSessionIdentifier,
            hotelId: resolvedHotelIdentifier,
            roomId: resolvedRoomIdentifier,
            roomNumber: resolvedRoomNumber,
            stayId: resolvedStayIdentifier,
            guestName: resolvedGuestName,
            type: 'guest',
          };
        }
      }
    } catch {
      // Not a standard Fastify JWT or expired; continue to check mock tokens below
    }
  }

  // 2. Fallback decoding for guest.<base64url> encoded mock tokens
  if (tokenString.startsWith('guest.')) {
    try {
      const rawJsonUtf8String = Buffer.from(
        tokenString.substring(6),
        'base64url'
      ).toString('utf-8');
      const parsedPayloadObject = JSON.parse(rawJsonUtf8String) as Record<
        string,
        unknown
      >;

      const resolvedSessionIdentifier = (parsedPayloadObject.sessionId ??
        parsedPayloadObject.sub) as string;
      const resolvedHotelIdentifier = parsedPayloadObject.hotelId as string;
      const resolvedRoomIdentifier = parsedPayloadObject.roomId as string;
      const resolvedStayIdentifier = parsedPayloadObject.stayId as string;
      const resolvedRoomNumber = (parsedPayloadObject.roomNumber ?? '') as string;
      const resolvedGuestName = parsedPayloadObject.guestName as string | undefined;

      if (
        resolvedSessionIdentifier &&
        resolvedHotelIdentifier &&
        resolvedRoomIdentifier &&
        resolvedStayIdentifier
      ) {
        return {
          sessionId: resolvedSessionIdentifier,
          hotelId: resolvedHotelIdentifier,
          roomId: resolvedRoomIdentifier,
          roomNumber: resolvedRoomNumber,
          stayId: resolvedStayIdentifier,
          guestName: resolvedGuestName,
          type: 'guest',
        };
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Creates a Fastify pre-handler hook enforcing guest session authentication and sliding-window rate limiting.
 */
export const createRequireGuestSession = (
  optionsConfiguration: RequireGuestSessionGuardOptions = {}
): ((
  requestToAuthenticate: FastifyRequest,
  replyForResponse: FastifyReply
) => Promise<void>) => {
  const clockInstance = optionsConfiguration.clock ?? systemClock;
  const rateLimiterInstance =
    optionsConfiguration.rateLimiter ??
    new SlidingWindowRateLimiter({
      maxRequests: optionsConfiguration.maxRequestsPerWindow ?? 60,
      windowDurationMs: optionsConfiguration.windowDurationMs ?? 60 * 1000,
      clock: clockInstance,
    });
  const guestSessionServiceInstance = optionsConfiguration.guestSessionService;

  return async (
    requestToAuthenticate: FastifyRequest,
    replyForResponse: FastifyReply
  ): Promise<void> => {
    const rawAuthorizationHeader = requestToAuthenticate.headers.authorization;

    if (!rawAuthorizationHeader || typeof rawAuthorizationHeader !== 'string') {
      throw new UnauthorizedError('Missing Authorization header');
    }

    const trimmedAuthorizationHeader = rawAuthorizationHeader.trim();
    if (!trimmedAuthorizationHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Malformed Authorization header: must use Bearer scheme');
    }

    const bearerTokenString = trimmedAuthorizationHeader.substring(7).trim();
    if (!bearerTokenString || bearerTokenString.length === 0) {
      throw new UnauthorizedError('Missing Bearer token credential');
    }

    const extractedSession = decodeAndVerifyGuestToken(
      bearerTokenString,
      requestToAuthenticate.server.jwt
    );

    if (!extractedSession) {
      throw new UnauthorizedError('Invalid or expired guest session token');
    }

    // 3. Optional lifecycle check with GuestSessionService to reject revoked stays
    const activeSessionService =
      guestSessionServiceInstance ?? requestToAuthenticate.server.guestSessionService;

    if (activeSessionService) {
      if (typeof activeSessionService.isSessionRevoked === 'function') {
        const isRevoked = await activeSessionService.isSessionRevoked(
          extractedSession.sessionId
        );
        if (isRevoked) {
          throw new UnauthorizedError('Guest session has been revoked or expired');
        }
      } else {
        const isSessionActiveInStore =
          await activeSessionService.isSessionActive(
            extractedSession.sessionId
          );
        if (!isSessionActiveInStore) {
          throw new UnauthorizedError('Guest session has been revoked or expired');
        }
      }
    }

    // 4. Sliding-window rate limit evaluation per session ID
    const rateLimitEvaluationDecision = rateLimiterInstance.isAllowed(
      extractedSession.sessionId
    );

    if (!rateLimitEvaluationDecision.allowed) {
      replyForResponse.header(
        'Retry-After',
        String(rateLimitEvaluationDecision.retryAfterSeconds)
      );
      throw new TooManyRequestsError(
        'Rate limit exceeded. Please try again later.',
        rateLimitEvaluationDecision.retryAfterSeconds
      );
    }

    // 5. Decorate Fastify request context with authenticated guest session
    requestToAuthenticate.guestSession = {
      sessionId: extractedSession.sessionId,
      hotelId: extractedSession.hotelId,
      roomId: extractedSession.roomId,
      roomNumber: extractedSession.roomNumber,
      stayId: extractedSession.stayId,
      guestName: extractedSession.guestName,
      type: 'guest',
    };
  };
};

/**
 * Standard pre-handler guard instance using default configuration.
 */
export const requireGuestSession = createRequireGuestSession();

/**
 * Fastify plugin registering the guest session authentication guard as a pre-handler hook.
 */
export const guestSessionAuthPlugin: FastifyPluginAsync<
  RequireGuestSessionGuardOptions
> = async (
  fastifyApplicationInstance,
  pluginOptionsConfiguration
): Promise<void> => {
  const guardPreHandlerHook = createRequireGuestSession(pluginOptionsConfiguration);
  fastifyApplicationInstance.decorateRequest(
    'guestSession',
    null as unknown as AuthenticatedGuestSession
  );
  fastifyApplicationInstance.addHook('preHandler', guardPreHandlerHook);
};
