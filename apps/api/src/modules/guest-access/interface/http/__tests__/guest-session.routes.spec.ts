/**
 * WHAT IT DOES:
 * Fastify route injection tests for `/api/v1/guest/sessions` and `/api/v1/guest/sessions/me`.
 * Verifies status codes (201 Created, 403 Forbidden with ROOM_NOT_OCCUPIED, 401 Unauthorized),
 * response headers, and session revocation via `stay.checked_out` event bus dispatch.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Route injection tests verify HTTP contracts, JSON serialization, status codes,
 *   and error handler integration without spinning up full TCP listening sockets.
 * - Asserts the core acceptance criteria:
 *   1. Unoccupied room returns HTTP 403 with `ROOM_NOT_OCCUPIED`.
 *   2. Occupied room returns HTTP 201 with session token and metadata.
 *   3. Emitting `stay.checked_out` on the event bus immediately revokes the session.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../../../../shared/events/event-bus.js';
import { MockClock } from '../../../../../shared/utils/clock.js';
import { registerErrorHandler } from '../../../../../shared/http/error-handler.js';
import { QRTokenService } from '../../../../rooms/domain/qr-token.service.js';
import { GuestSessionService } from '../../../application/guest-session.service.js';
import { MockActiveStayLookupPort } from '../../../application/ports/active-stay-lookup.port.js';
import { registerStayCheckedOutSubscriber } from '../../../infrastructure/stay-checked-out.subscriber.js';
import { registerGuestRoutes } from '../guest-session.routes.js';

const TEST_SECRET_KEY = 'super-secret-signing-key-minimum-32-chars-long!';
const FIXED_BASE_DATE = new Date('2026-10-27T14:00:00.000Z');

describe('Guest Session Routes (/api/v1/guest/sessions)', () => {
  let fastifyApplicationInstance: FastifyInstance;
  let mockClockInstance: MockClock;
  let mockActiveStayLookupPort: MockActiveStayLookupPort;
  let inMemoryEventBus: EventBus;
  let qrTokenService: QRTokenService;
  let guestSessionService: GuestSessionService;

  beforeEach(async () => {
    mockClockInstance = new MockClock(FIXED_BASE_DATE);
    mockActiveStayLookupPort = new MockActiveStayLookupPort();
    inMemoryEventBus = new EventBus();
    qrTokenService = new QRTokenService(TEST_SECRET_KEY, mockClockInstance);

    fastifyApplicationInstance = Fastify();
    await fastifyApplicationInstance.register(fastifyJwt, { secret: TEST_SECRET_KEY });
    registerErrorHandler(fastifyApplicationInstance);

    guestSessionService = new GuestSessionService({
      activeStayLookupPort: mockActiveStayLookupPort,
      qrTokenService,
      clock: mockClockInstance,
      eventBus: inMemoryEventBus,
      signGuestToken: (sessionClaims) =>
        fastifyApplicationInstance.jwt.sign(sessionClaims, { expiresIn: '2h' }),
    });

    registerStayCheckedOutSubscriber({
      eventBus: inMemoryEventBus,
      guestSessionService,
    });

    await fastifyApplicationInstance.register(
      async (apiSubsystem) => {
        registerGuestRoutes(apiSubsystem, { guestSessionService });
      },
      { prefix: '/api/v1' }
    );

    await fastifyApplicationInstance.ready();
  });

  afterEach(async () => {
    await fastifyApplicationInstance.close();
  });

  describe('POST /api/v1/guest/sessions', () => {
    it('returns HTTP 201 with guest session token and room display metadata when room has active stay', async () => {
      const hotelIdentifier = 'hotel-uuid-500';
      const roomIdentifier = 'room-uuid-600';
      const roomNumberString = '502';
      const stayIdentifier = 'stay-uuid-active';

      const validRoomQrTokenString = qrTokenService.generateToken({
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
      });

      mockActiveStayLookupPort.setActiveStay({
        id: stayIdentifier,
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
        guestName: 'Jonathan Harker',
        checkedInAt: FIXED_BASE_DATE,
        expectedCheckOutAt: new Date(FIXED_BASE_DATE.getTime() + 86400 * 1000),
      });

      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: {
          qrToken: validRoomQrTokenString,
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(201);
      expect(httpInjectionResponse.headers['content-type']).toContain('application/json');

      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.token).toBeDefined();
      expect(typeof responsePayload.token).toBe('string');
      expect(responsePayload.hotelId).toBe(hotelIdentifier);
      expect(responsePayload.roomId).toBe(roomIdentifier);
      expect(responsePayload.roomNumber).toBe(roomNumberString);
      expect(responsePayload.stayId).toBe(stayIdentifier);
      expect(responsePayload.guestName).toBe('Jonathan Harker');
      expect(responsePayload.expiresAt).toBeDefined();
    });

    it('returns HTTP 403 Forbidden with code ROOM_NOT_OCCUPIED when room has no active stay', async () => {
      const hotelIdentifier = 'hotel-uuid-500';
      const roomIdentifier = 'room-uuid-vacant';
      const roomNumberString = '404';

      const validQrTokenForVacantRoom = qrTokenService.generateToken({
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
      });

      // No active stay is registered
      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: {
          qrToken: validQrTokenForVacantRoom,
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(403);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.error).toBeDefined();
      expect(responsePayload.error.code).toBe('ROOM_NOT_OCCUPIED');
      expect(responsePayload.error.message).toContain('not currently occupied');
    });

    it('returns HTTP 403 Forbidden with code ROOM_NOT_OCCUPIED when stay is already checked out', async () => {
      const hotelIdentifier = 'hotel-uuid-500';
      const roomIdentifier = 'room-uuid-checked-out';
      const roomNumberString = '201';

      const validQrTokenString = qrTokenService.generateToken({
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
      });

      mockActiveStayLookupPort.setActiveStay({
        id: 'stay-already-checked-out',
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
        guestName: 'Mina Murray',
        checkedInAt: new Date(FIXED_BASE_DATE.getTime() - 86400 * 1000),
        expectedCheckOutAt: FIXED_BASE_DATE,
        checkedOutAt: FIXED_BASE_DATE,
      });

      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: {
          qrToken: validQrTokenString,
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(403);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.error.code).toBe('ROOM_NOT_OCCUPIED');
    });

    it('returns HTTP 400 Bad Request when qrToken is missing in request body', async () => {
      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: {},
      });

      expect(httpInjectionResponse.statusCode).toBe(400);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns HTTP 401 Unauthorized when qrToken is cryptographically invalid', async () => {
      const httpInjectionResponse = await fastifyApplicationInstance.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: {
          qrToken: 'completely-invalid-and-tampered-token',
        },
      });

      expect(httpInjectionResponse.statusCode).toBe(401);
      const responsePayload = JSON.parse(httpInjectionResponse.body);
      expect(responsePayload.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Session Invalidation via stay.checked_out Event', () => {
    it('revokes session authorization immediately upon receipt of stay.checked_out event', async () => {
      const hotelIdentifier = 'hotel-uuid-500';
      const roomIdentifier = 'room-uuid-600';
      const roomNumberString = '502';
      const stayIdentifier = 'stay-to-be-checked-out';

      const validRoomQrTokenString = qrTokenService.generateToken({
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
      });

      mockActiveStayLookupPort.setActiveStay({
        id: stayIdentifier,
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
        guestName: 'Arthur Holmwood',
        checkedInAt: FIXED_BASE_DATE,
        expectedCheckOutAt: new Date(FIXED_BASE_DATE.getTime() + 86400 * 1000),
      });

      // 1. Issue guest session
      const createSessionResponse = await fastifyApplicationInstance.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: { qrToken: validRoomQrTokenString },
      });

      expect(createSessionResponse.statusCode).toBe(201);
      const sessionPayload = JSON.parse(createSessionResponse.body);
      const issuedGuestToken = sessionPayload.token;

      // 2. Verify session is currently valid
      const meResponseBeforeCheckout = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/sessions/me',
        headers: {
          authorization: `Bearer ${issuedGuestToken}`,
        },
      });

      expect(meResponseBeforeCheckout.statusCode).toBe(200);
      const mePayload = JSON.parse(meResponseBeforeCheckout.body);
      expect(mePayload.sessionId).toBe(sessionPayload.sessionId);

      // 3. Dispatch stay.checked_out domain event on event bus
      await inMemoryEventBus.publish({
        eventName: 'stay.checked_out',
        hotelId: hotelIdentifier,
        stayId: stayIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
        guestName: 'Arthur Holmwood',
        occurredAt: new Date().toISOString(),
      });

      // 4. Verification: Session is now revoked, subsequent calls return 401 Unauthorized
      const meResponseAfterCheckout = await fastifyApplicationInstance.inject({
        method: 'GET',
        url: '/api/v1/guest/sessions/me',
        headers: {
          authorization: `Bearer ${issuedGuestToken}`,
        },
      });

      expect(meResponseAfterCheckout.statusCode).toBe(401);
      const afterCheckoutPayload = JSON.parse(meResponseAfterCheckout.body);
      expect(afterCheckoutPayload.error.code).toBe('UNAUTHORIZED');
      expect(afterCheckoutPayload.error.message).toContain('revoked');
    });
  });
});
