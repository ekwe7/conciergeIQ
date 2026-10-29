/**
 * WHAT IT DOES:
 * Unit and route injection test suite for `requireGuestSession` guard and sliding-window rate limiter.
 * Tests Bearer token extraction, invalid signature rejection, expired token handling,
 * and simulates 65 rapid requests asserting HTTP 429 with `Retry-After: 60` on requests 61–65.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Validates critical security boundaries before guest traffic reaches ordering or concierge handlers.
 * - Asserts rate limiting isolation across different session IDs.
 * - Uses `MockClock` to verify sliding-window expiration without slow or brittle real-world timeouts.
 * - Uses Fastify `inject` for zero-overhead in-memory HTTP testing.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockClock } from '../../../utils/clock.js';
import { registerErrorHandler } from '../../error-handler.js';
import { SlidingWindowRateLimiter } from '../../rate-limit.js';
import {
  createRequireGuestSession,
  type AuthenticatedGuestSession,
} from '../require-guest-session.js';

const TEST_JWT_SECRET_KEY = 'super-secret-jwt-key-minimum-32-chars-long!';
const UNTRUSTED_JWT_SECRET_KEY = 'wrong-signature-key-different-secret-32b!';
const FIXED_BASE_TIMESTAMP = new Date('2026-10-29T12:00:00.000Z');

/** Helper to sign guest session tokens avoiding JWT payload type collisions with Staff tokens */
const signTestGuestToken = (
  app: FastifyInstance,
  payload: Record<string, unknown>,
  options?: Parameters<FastifyInstance['jwt']['sign']>[1]
): string => {
  return app.jwt.sign(
    payload as unknown as Parameters<FastifyInstance['jwt']['sign']>[0],
    options
  );
};

describe('requireGuestSession Guard and Rate Limiter', () => {
  let fastifyApplicationInstance: FastifyInstance;
  let mockClockInstance: MockClock;
  let slidingWindowRateLimiter: SlidingWindowRateLimiter;

  beforeEach(async () => {
    mockClockInstance = new MockClock(FIXED_BASE_TIMESTAMP);
    slidingWindowRateLimiter = new SlidingWindowRateLimiter({
      maxRequests: 60,
      windowDurationMs: 60 * 1000,
      clock: mockClockInstance,
    });

    fastifyApplicationInstance = Fastify();
    await fastifyApplicationInstance.register(fastifyJwt, { secret: TEST_JWT_SECRET_KEY });
    registerErrorHandler(fastifyApplicationInstance);

    const guestSessionGuardHook = createRequireGuestSession({
      rateLimiter: slidingWindowRateLimiter,
      clock: mockClockInstance,
      maxRequestsPerWindow: 60,
      windowDurationMs: 60 * 1000,
    });

    // Register a protected test route that echoes request.guestSession
    fastifyApplicationInstance.get(
      '/api/v1/guest/protected-resource',
      { preHandler: [guestSessionGuardHook] },
      async (request) => ({
        status: 'success',
        session: request.guestSession,
      })
    );

    await fastifyApplicationInstance.ready();
  });

  afterEach(async () => {
    await fastifyApplicationInstance.close();
  });

  describe('Authentication and Token Extraction', () => {
    it('rejects request lacking Authorization header with HTTP 401 Unauthorized', async () => {
      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/protected-resource',
      });

      expect(httpInjectionResponse.statusCode).toBe(401);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.error.code).toBe('UNAUTHORIZED');
      expect(responsePayload.error.message).toContain('Missing Authorization header');
    });

    it('rejects request with non-Bearer Authorization scheme with HTTP 401 Unauthorized', async () => {
      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/protected-resource',
        headers: {
          authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(401);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.error.code).toBe('UNAUTHORIZED');
      expect(responsePayload.error.message).toContain('must use Bearer scheme');
    });

    it('rejects request with empty Bearer token with HTTP 401 Unauthorized', async () => {
      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/protected-resource',
        headers: {
          authorization: 'Bearer   ',
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(401);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects request with invalid signature token with HTTP 401 Unauthorized', async () => {
      // Sign token using a completely different untrusted secret
      const untrustedFastifyApp = Fastify();
      await untrustedFastifyApp.register(fastifyJwt, { secret: UNTRUSTED_JWT_SECRET_KEY });
      const forgedTokenString = signTestGuestToken(untrustedFastifyApp, {
        sessionId: 'session-attacker',
        hotelId: 'hotel-001',
        roomId: 'room-101',
        stayId: 'stay-101',
        type: 'guest',
      });
      await untrustedFastifyApp.close();

      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/protected-resource',
        headers: {
          authorization: `Bearer ${forgedTokenString}`,
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(401);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects expired JWT token with HTTP 401 Unauthorized', async () => {
      // Token signed with past expiration timestamp (already expired)
      const currentEpochSeconds = Math.floor(Date.now() / 1000);
      const expiredTokenString = signTestGuestToken(fastifyApplicationInstance, {
        sessionId: 'session-expired',
        hotelId: 'hotel-001',
        roomId: 'room-101',
        stayId: 'stay-101',
        type: 'guest',
        iat: currentEpochSeconds - 100,
        exp: currentEpochSeconds - 10,
      });

      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/protected-resource',
        headers: {
          authorization: `Bearer ${expiredTokenString}`,
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(401);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.error.code).toBe('UNAUTHORIZED');
    });

    it('successfully extracts valid token and decorates request.guestSession with session context', async () => {
      const validGuestTokenString = signTestGuestToken(fastifyApplicationInstance, {
        sessionId: 'session-valid-123',
        hotelId: 'hotel-uuid-1',
        roomId: 'room-uuid-101',
        roomNumber: '101',
        stayId: 'stay-uuid-999',
        guestName: 'Jonathan Harker',
        type: 'guest',
      });

      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/protected-resource',
        headers: {
          authorization: `Bearer ${validGuestTokenString}`,
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(200);
      const responsePayload = JSON.parse(httpInjectionResponse.body) as {
        status: string;
        session: AuthenticatedGuestSession;
      };

      expect(responsePayload.status).toBe('success');
      expect(responsePayload.session.sessionId).toBe('session-valid-123');
      expect(responsePayload.session.hotelId).toBe('hotel-uuid-1');
      expect(responsePayload.session.roomId).toBe('room-uuid-101');
      expect(responsePayload.session.roomNumber).toBe('101');
      expect(responsePayload.session.stayId).toBe('stay-uuid-999');
      expect(responsePayload.session.guestName).toBe('Jonathan Harker');
      expect(responsePayload.session.type).toBe('guest');
    });
  });

  describe('Sliding-Window Rate Limiting (60 requests / minute)', () => {
    it('allows 60 rapid requests and triggers HTTP 429 Too Many Requests with Retry-After on requests 61 to 65', async () => {
      const activeSessionIdentifier = 'session-rate-limit-stress';
      const validGuestTokenString = signTestGuestToken(fastifyApplicationInstance, {
        sessionId: activeSessionIdentifier,
        hotelId: 'hotel-uuid-1',
        roomId: 'room-uuid-101',
        roomNumber: '101',
        stayId: 'stay-uuid-999',
        type: 'guest',
      });

      // Send 60 requests: all 60 must succeed with HTTP 200
      for (
        let requestIterationIndex = 1;
        requestIterationIndex <= 60;
        requestIterationIndex++
      ) {
        const allowedInjectionResponse = await fastifyApplicationInstance.inject({
          method: 'GET',
          url: '/api/v1/guest/protected-resource',
          headers: {
            authorization: `Bearer ${validGuestTokenString}`,
          },
        });

        expect(
          allowedInjectionResponse.statusCode,
          `Request #${requestIterationIndex} should succeed`
        ).toBe(200);
      }

      // Send requests 61 through 65: all 5 must be rejected with HTTP 429
      for (
        let excessiveRequestIndex = 61;
        excessiveRequestIndex <= 65;
        excessiveRequestIndex++
      ) {
        const rateLimitedInjectionResponse = await fastifyApplicationInstance.inject({
          method: 'GET',
          url: '/api/v1/guest/protected-resource',
          headers: {
            authorization: `Bearer ${validGuestTokenString}`,
          },
        });

        expect(
          rateLimitedInjectionResponse.statusCode,
          `Request #${excessiveRequestIndex} should be rate-limited`
        ).toBe(429);

        // Header Retry-After must be present
        expect(rateLimitedInjectionResponse.headers['retry-after']).toBeDefined();
        const retryAfterSecondsHeader = Number(
          rateLimitedInjectionResponse.headers['retry-after']
        );
        expect(retryAfterSecondsHeader).toBeGreaterThanOrEqual(1);
        expect(retryAfterSecondsHeader).toBeLessThanOrEqual(60);

        const responsePayload = JSON.parse(rateLimitedInjectionResponse.body);
        expect(responsePayload.error.code).toBe('TOO_MANY_REQUESTS');
        expect(responsePayload.error.message).toContain('Rate limit exceeded');
      }
    });

    it('isolates rate limits per session ID (Session A hitting limit does not throttle Session B)', async () => {
      const sessionAIdentifier = 'session-client-a';
      const sessionBIdentifier = 'session-client-b';

      const tokenA = signTestGuestToken(fastifyApplicationInstance, {
        sessionId: sessionAIdentifier,
        hotelId: 'hotel-1',
        roomId: 'room-1',
        stayId: 'stay-1',
        type: 'guest',
      });

      const tokenB = signTestGuestToken(fastifyApplicationInstance, {
        sessionId: sessionBIdentifier,
        hotelId: 'hotel-1',
        roomId: 'room-2',
        stayId: 'stay-2',
        type: 'guest',
      });

      // Saturate Session A limit (60 requests)
      for (let requestIndex = 0; requestIndex < 60; requestIndex++) {
        await fastifyApplicationInstance.inject({
          method: 'GET',
          url: '/api/v1/guest/protected-resource',
          headers: { authorization: `Bearer ${tokenA}` },
        });
      }

      // 61st request from Session A must be throttled
      const sessionAThrottledResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/protected-resource',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(sessionAThrottledResponse.statusCode).toBe(429);

      // Session B must NOT be throttled
      const sessionBResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/protected-resource',
        headers: { authorization: `Bearer ${tokenB}` },
      });
      expect(sessionBResponse.statusCode).toBe(200);
    });

    it('resets allowed capacity once sliding window time advances past 60 seconds', async () => {
      const sessionIdentifier = 'session-window-advance';
      const validGuestToken = signTestGuestToken(fastifyApplicationInstance, {
        sessionId: sessionIdentifier,
        hotelId: 'hotel-1',
        roomId: 'room-1',
        stayId: 'stay-1',
        type: 'guest',
      });

      // Exhaust limit
      for (let requestIndex = 0; requestIndex < 60; requestIndex++) {
        await fastifyApplicationInstance.inject({
          method: 'GET',
          url: '/api/v1/guest/protected-resource',
          headers: { authorization: `Bearer ${validGuestToken}` },
        });
      }

      const throttledResponse = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/protected-resource',
        headers: { authorization: `Bearer ${validGuestToken}` },
      });
      expect(throttledResponse.statusCode).toBe(429);

      // Advance clock by 61 seconds (past 60s sliding window)
      mockClockInstance.advanceByMs(61 * 1000);

      // Request must now succeed
      const allowedAfterTimeAdvance = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/protected-resource',
        headers: { authorization: `Bearer ${validGuestToken}` },
      });
      expect(allowedAfterTimeAdvance.statusCode).toBe(200);
    });
  });
});
