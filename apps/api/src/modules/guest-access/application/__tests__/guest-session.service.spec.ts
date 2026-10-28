/**
 * WHAT IT DOES:
 * Unit test suite for `GuestSessionService` testing QR token resolution, stay status validation
 * via `MockActiveStayLookupPort`, ephemeral session issuance, and lifecycle revocation.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Tests active stay status boundaries: checked-in, vacant, and checked-out rooms.
 * - Asserts that vacant and checked-out rooms throw `RoomNotOccupiedError` with HTTP 403 and code `ROOM_NOT_OCCUPIED`.
 * - Uses `MockActiveStayLookupPort`, `MockClock`, and in-memory `EventBus` for isolated, deterministic execution.
 * - All test callbacks and helper functions use arrow functions and descriptive variable names.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { EventBus } from '../../../../shared/events/event-bus.js';
import { MockClock } from '../../../../shared/utils/clock.js';
import { RoomNotOccupiedError, UnauthorizedError } from '../../../../shared/errors/app-error.js';
import { QRTokenService } from '../../../rooms/index.js';
import { GuestSessionService } from '../guest-session.service.js';
import {
  MockActiveStayLookupPort,
  type ActiveStaySummary,
} from '../ports/active-stay-lookup.port.js';
import { MockRoomLookupPort } from '../ports/room-lookup.port.js';

const TEST_SECRET_KEY = 'super-secret-cryptographic-signing-key-32-bytes!';
const FIXED_BASE_DATE = new Date('2026-10-27T12:00:00.000Z');

describe('GuestSessionService', () => {
  let mockClockInstance: MockClock;
  let mockActiveStayLookupPort: MockActiveStayLookupPort;
  let mockRoomLookupPort: MockRoomLookupPort;
  let qrTokenService: QRTokenService;
  let inMemoryEventBus: EventBus;
  let guestSessionService: GuestSessionService;

  beforeEach(() => {
    mockClockInstance = new MockClock(FIXED_BASE_DATE);
    mockActiveStayLookupPort = new MockActiveStayLookupPort();
    mockRoomLookupPort = new MockRoomLookupPort();
    inMemoryEventBus = new EventBus();
    qrTokenService = new QRTokenService(TEST_SECRET_KEY, mockClockInstance);

    guestSessionService = new GuestSessionService({
      activeStayLookupPort: mockActiveStayLookupPort,
      qrTokenService,
      roomLookupPort: mockRoomLookupPort,
      clock: mockClockInstance,
      eventBus: inMemoryEventBus,
      sessionTtlSeconds: 3600, // 1 hour
    });
  });

  describe('Session Resolution with Active Stay', () => {
    it('successfully issues a guest session when room is occupied with an active stay', async () => {
      const hotelIdentifier = 'hotel-uuid-101';
      const roomIdentifier = 'room-uuid-202';
      const roomNumberString = '305';
      const stayIdentifier = 'stay-uuid-777';

      const validQrTokenString = qrTokenService.generateToken({
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
      });

      const activeStayRecord: ActiveStaySummary = {
        id: stayIdentifier,
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
        guestName: 'Eleanor Vance',
        guestPhone: '+1-555-0199',
        checkedInAt: FIXED_BASE_DATE,
        expectedCheckOutAt: new Date(FIXED_BASE_DATE.getTime() + 86400 * 1000),
      };
      mockActiveStayLookupPort.setActiveStay(activeStayRecord);

      const sessionResponse = await guestSessionService.resolveSession({
        qrToken: validQrTokenString,
      });

      expect(sessionResponse).toBeDefined();
      expect(sessionResponse.hotelId).toBe(hotelIdentifier);
      expect(sessionResponse.roomId).toBe(roomIdentifier);
      expect(sessionResponse.roomNumber).toBe(roomNumberString);
      expect(sessionResponse.guestName).toBe('Eleanor Vance');
      expect(sessionResponse.stayId).toBe(stayIdentifier);
      expect(typeof sessionResponse.sessionId).toBe('string');
      expect(typeof sessionResponse.token).toBe('string');
      expect(sessionResponse.token?.length).toBeGreaterThan(0);

      // Verify the session is recorded as active
      const isActive = await guestSessionService.isSessionActive(sessionResponse.sessionId);
      expect(isActive).toBe(true);
    });

    it('resolves session using legacy database QR token via RoomLookupPort', async () => {
      const hotelIdentifier = 'hotel-uuid-101';
      const roomIdentifier = 'room-uuid-legacy';
      const roomNumberString = '101';
      const stayIdentifier = 'stay-uuid-legacy';
      const legacyOpaqueQrToken = 'legacy-opaque-token-string-1234';

      mockRoomLookupPort.setRoom(
        {
          id: roomIdentifier,
          hotelId: hotelIdentifier,
          number: roomNumberString,
          isOutOfOrder: false,
        },
        legacyOpaqueQrToken
      );

      mockActiveStayLookupPort.setActiveStay({
        id: stayIdentifier,
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
        guestName: 'Theodora Crain',
        checkedInAt: FIXED_BASE_DATE,
        expectedCheckOutAt: new Date(FIXED_BASE_DATE.getTime() + 86400 * 1000),
      });

      const sessionResponse = await guestSessionService.resolveSession({
        qrToken: legacyOpaqueQrToken,
      });

      expect(sessionResponse.roomId).toBe(roomIdentifier);
      expect(sessionResponse.stayId).toBe(stayIdentifier);
      expect(sessionResponse.guestName).toBe('Theodora Crain');
    });
  });

  describe('Unoccupied and Checked-Out Room Rejection', () => {
    it('throws RoomNotOccupiedError (403 ROOM_NOT_OCCUPIED) when room is vacant', async () => {
      const hotelIdentifier = 'hotel-uuid-101';
      const roomIdentifier = 'room-vacant-303';
      const roomNumberString = '303';

      const validQrTokenString = qrTokenService.generateToken({
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
      });

      // No stay registered in mockActiveStayLookupPort (vacant room)
      await expect(
        guestSessionService.resolveSession({ qrToken: validQrTokenString })
      ).rejects.toThrow(RoomNotOccupiedError);

      try {
        await guestSessionService.resolveSession({ qrToken: validQrTokenString });
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(RoomNotOccupiedError);
        const appError = thrownError as RoomNotOccupiedError;
        expect(appError.statusCode).toBe(403);
        expect(appError.code).toBe('ROOM_NOT_OCCUPIED');
      }
    });

    it('throws RoomNotOccupiedError (403 ROOM_NOT_OCCUPIED) when guest has already checked out', async () => {
      const hotelIdentifier = 'hotel-uuid-101';
      const roomIdentifier = 'room-uuid-404';
      const roomNumberString = '404';

      const validQrTokenString = qrTokenService.generateToken({
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
      });

      // Set stay with checkedOutAt timestamp
      mockActiveStayLookupPort.setActiveStay({
        id: 'stay-checked-out-id',
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: roomNumberString,
        guestName: 'Luke Sanderson',
        checkedInAt: new Date(FIXED_BASE_DATE.getTime() - 86400 * 1000),
        expectedCheckOutAt: FIXED_BASE_DATE,
        checkedOutAt: FIXED_BASE_DATE,
      });

      await expect(
        guestSessionService.resolveSession({ qrToken: validQrTokenString })
      ).rejects.toThrow(RoomNotOccupiedError);
    });

    it('throws UnauthorizedError when QR token is invalid or tampered', async () => {
      const tamperedQrTokenString = 'tampered-or-invalid-token-characters';

      await expect(
        guestSessionService.resolveSession({ qrToken: tamperedQrTokenString })
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('Session Lifecycle and Revocation', () => {
    it('revokes active guest sessions when revokeSessionsForStay is called', async () => {
      const hotelIdentifier = 'hotel-uuid-101';
      const roomIdentifier = 'room-uuid-202';
      const stayIdentifier = 'stay-uuid-revocation';

      const validQrTokenString = qrTokenService.generateToken({
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: '202',
      });

      mockActiveStayLookupPort.setActiveStay({
        id: stayIdentifier,
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: '202',
        checkedInAt: FIXED_BASE_DATE,
        expectedCheckOutAt: new Date(FIXED_BASE_DATE.getTime() + 86400 * 1000),
      });

      const sessionResponse = await guestSessionService.resolveSession({
        qrToken: validQrTokenString,
      });

      expect(await guestSessionService.isSessionActive(sessionResponse.sessionId)).toBe(true);

      // Perform revocation
      const revokedSessionIds = await guestSessionService.revokeSessionsForStay(
        stayIdentifier,
        'checked_out'
      );

      expect(revokedSessionIds).toContain(sessionResponse.sessionId);
      expect(await guestSessionService.isSessionActive(sessionResponse.sessionId)).toBe(false);

      const sessionAfterRevocation = await guestSessionService.validateSession(
        sessionResponse.sessionId
      );
      expect(sessionAfterRevocation).toBeUndefined();
    });

    it('marks session as expired when clock advances past session TTL', async () => {
      const hotelIdentifier = 'hotel-uuid-101';
      const roomIdentifier = 'room-uuid-202';

      const validQrTokenString = qrTokenService.generateToken({
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: '202',
      });

      mockActiveStayLookupPort.setActiveStay({
        id: 'stay-ttl-test',
        hotelId: hotelIdentifier,
        roomId: roomIdentifier,
        roomNumber: '202',
        checkedInAt: FIXED_BASE_DATE,
        expectedCheckOutAt: new Date(FIXED_BASE_DATE.getTime() + 86400 * 1000),
      });

      const sessionResponse = await guestSessionService.resolveSession({
        qrToken: validQrTokenString,
      });

      expect(await guestSessionService.isSessionActive(sessionResponse.sessionId)).toBe(true);

      // Advance clock by 3601 seconds (past 3600s TTL)
      mockClockInstance.advanceByMs(3601 * 1000);

      expect(await guestSessionService.isSessionActive(sessionResponse.sessionId)).toBe(false);
    });
  });
});
