/**
 * WHAT IT DOES:
 * HTTP controller handling guest session operations:
 * - `POST /api/v1/guest/sessions`: Resolves a room QR token into an active guest session.
 * - `GET /api/v1/guest/sessions/me`: Validates active guest session status.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Validates incoming payloads using `ResolveGuestSessionSchema`.
 * - Returns HTTP 201 with session metadata and token upon successful resolution.
 * - Enforces session validity: if a session was revoked via checkout, requests return HTTP 401.
 * - Uses arrow functions and descriptive variable names throughout.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { ResolveGuestSessionSchema } from '@conciergeiq/contracts';
import { parseInput } from '../../../../shared/http/validation.js';
import { UnauthorizedError } from '../../../../shared/errors/app-error.js';
import type { GuestSessionService } from '../../application/guest-session.service.js';

export class GuestSessionController {
  constructor(private readonly guestSessionService: GuestSessionService) {}

  /**
   * Resolves a room QR token into an ephemeral guest session.
   */
  public resolveSession = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const validatedSessionInput = parseInput(
      ResolveGuestSessionSchema,
      request.body
    );

    const createdSessionResponse = await this.guestSessionService.resolveSession(
      validatedSessionInput
    );

    return reply.status(201).send(createdSessionResponse);
  };

  /**
   * Validates whether the currently presented guest token/session remains active.
   */
  public getSessionMe = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const rawAuthorizationHeader = request.headers.authorization;
    if (!rawAuthorizationHeader || !rawAuthorizationHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const bearerTokenString = rawAuthorizationHeader.substring(7).trim();
    let extractedSessionIdentifier: string | undefined;

    // Try decoding claims from JWT or fallback bearer format
    try {
      if (request.server.jwt) {
        const decodedClaims =
          request.server.jwt.decode<{ sessionId?: string; sub?: string }>(bearerTokenString);
        extractedSessionIdentifier = decodedClaims?.sessionId ?? decodedClaims?.sub;
      }
    } catch {
      // Fallback
    }

    if (!extractedSessionIdentifier) {
      if (bearerTokenString.startsWith('guest.')) {
        try {
          const jsonString = Buffer.from(
            bearerTokenString.substring(6),
            'base64url'
          ).toString('utf-8');
          const parsedClaims = JSON.parse(jsonString) as { sessionId?: string; sub?: string };
          extractedSessionIdentifier = parsedClaims.sessionId ?? parsedClaims.sub;
        } catch {
          // ignore
        }
      }
    }

    if (!extractedSessionIdentifier) {
      extractedSessionIdentifier = bearerTokenString;
    }

    const activeSessionRecord = await this.guestSessionService.validateSession(
      extractedSessionIdentifier
    );

    if (!activeSessionRecord) {
      throw new UnauthorizedError('Guest session is expired or revoked');
    }

    return reply.status(200).send({
      sessionId: activeSessionRecord.id,
      hotelId: activeSessionRecord.hotelId,
      roomId: activeSessionRecord.roomId,
      roomNumber: activeSessionRecord.roomNumber,
      stayId: activeStayIdOrNull(activeSessionRecord.stayId),
      guestName: activeSessionRecord.guestName ?? undefined,
      expiresAt: activeSessionRecord.expiresAt.toISOString(),
      status: activeSessionRecord.status,
    });
  };
}

const activeStayIdOrNull = (stayIdentifier: string): string => stayIdentifier;
