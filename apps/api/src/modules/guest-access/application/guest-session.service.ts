/**
 * WHAT IT DOES:
 * Implements the core application service (`GuestSessionService`) for guest QR code resolution,
 * stay validation via `ActiveStayLookupPort`, ephemeral session issuance, and session lifecycle
 * revocation on checkout.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - A physical room QR code must only grant access to ordering when the room has an active,
 *   checked-in guest. Unoccupied rooms, vacant rooms, and checked-out stays must be strictly rejected
 *   with HTTP 403 `ROOM_NOT_OCCUPIED`.
 * - Cross-module isolation: Queries stay status exclusively through `ActiveStayLookupPort`
 *   rather than directly joining or reading from the stays database table.
 * - When `stay.checked_out` is received, `revokeSessionsForStay` immediately revokes all active
 *   sessions for that stay in the `GuestSessionRegistry`, preventing any stale QR tokens from ordering.
 * - Supports cryptographically signed QR tokens (via `QRTokenService`) as well as database-stored
 *   opaque tokens (via `RoomLookupPort`) for backwards compatibility.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import { randomUUID } from 'node:crypto';
import type {
  GuestSessionResponse,
  ResolveGuestSessionInput,
} from '@conciergeiq/contracts';
import {
  RoomNotOccupiedError,
  UnauthorizedError,
} from '../../../shared/errors/app-error.js';
import type { Clock } from '../../../shared/utils/clock.js';
import { systemClock } from '../../../shared/utils/clock.js';
import type { EventBus } from '../../../shared/events/event-bus.js';
import type { QRTokenService } from '../../rooms/domain/qr-token.service.js';
import type {
  GuestSession,
  GuestSessionClaims,
  GuestSessionRegistry,
} from '../domain/guest-session.js';
import { InMemoryGuestSessionRegistry } from '../domain/guest-session.js';
import type { ActiveStayLookupPort } from './ports/active-stay-lookup.port.js';
import type { RoomLookupPort } from './ports/room-lookup.port.js';

export interface GuestSessionServiceDependencies {
  readonly activeStayLookupPort: ActiveStayLookupPort;
  readonly qrTokenService?: QRTokenService;
  readonly roomLookupPort?: RoomLookupPort;
  readonly sessionRegistry?: GuestSessionRegistry;
  readonly clock?: Clock;
  readonly eventBus?: EventBus;
  readonly signGuestToken?: (sessionClaims: GuestSessionClaims) => string;
  readonly sessionTtlSeconds?: number;
}

const DEFAULT_GUEST_SESSION_TTL_SECONDS = 2 * 60 * 60; // 2 hours

export class GuestSessionService {
  private readonly activeStayLookupPort: ActiveStayLookupPort;
  private readonly qrTokenService?: QRTokenService;
  private readonly roomLookupPort?: RoomLookupPort;
  private readonly sessionRegistry: GuestSessionRegistry;
  private readonly clock: Clock;
  private readonly eventBus?: EventBus;
  private readonly signGuestTokenCallback: (sessionClaims: GuestSessionClaims) => string;
  private readonly sessionTtlSeconds: number;

  constructor(dependencies: GuestSessionServiceDependencies) {
    this.activeStayLookupPort = dependencies.activeStayLookupPort;
    this.qrTokenService = dependencies.qrTokenService;
    this.roomLookupPort = dependencies.roomLookupPort;
    this.sessionRegistry =
      dependencies.sessionRegistry ?? new InMemoryGuestSessionRegistry();
    this.clock = dependencies.clock ?? systemClock;
    this.eventBus = dependencies.eventBus;
    this.sessionTtlSeconds =
      dependencies.sessionTtlSeconds ?? DEFAULT_GUEST_SESSION_TTL_SECONDS;

    // Fallback simple token signer if no Fastify JWT signer is injected
    this.signGuestTokenCallback =
      dependencies.signGuestToken ??
      ((claimsRecord: GuestSessionClaims): string => {
        const payloadBase64 = Buffer.from(JSON.stringify(claimsRecord), 'utf-8').toString(
          'base64url'
        );
        return `guest.${payloadBase64}`;
      });
  }

  /**
   * Resolves a scanned QR token into an active guest session.
   * Rejects unoccupied or checked-out rooms with HTTP 403 `ROOM_NOT_OCCUPIED`.
   */
  public resolveSession = async (
    resolveSessionInput: ResolveGuestSessionInput
  ): Promise<GuestSessionResponse> => {
    if (!resolveSessionInput.qrToken || typeof resolveSessionInput.qrToken !== 'string') {
      throw new UnauthorizedError('Invalid or missing QR token');
    }

    const rawQrTokenString = resolveSessionInput.qrToken.trim();

    // 1. Resolve room identity: Attempt cryptographic verification first, then fallback to database port
    let resolvedHotelIdentifier: string | undefined;
    let resolvedRoomIdentifier: string | undefined;
    let resolvedRoomNumber: string | undefined;

    if (this.qrTokenService) {
      const cryptographicVerificationResult =
        this.qrTokenService.verifyToken(rawQrTokenString);
      if (cryptographicVerificationResult.success) {
        resolvedHotelIdentifier = cryptographicVerificationResult.payload.hotelId;
        resolvedRoomIdentifier = cryptographicVerificationResult.payload.roomId;
        resolvedRoomNumber = cryptographicVerificationResult.payload.roomNumber;
      }
    }

    // Fallback: Check opaque QR token via room lookup port if cryptographic check didn't resolve
    if (!resolvedHotelIdentifier && this.roomLookupPort?.findRoomByQrToken) {
      const matchedRoomRecord =
        await this.roomLookupPort.findRoomByQrToken(rawQrTokenString);
      if (matchedRoomRecord) {
        resolvedHotelIdentifier = matchedRoomRecord.hotelId;
        resolvedRoomIdentifier = matchedRoomRecord.id;
        resolvedRoomNumber = matchedRoomRecord.number;
      }
    }

    if (!resolvedHotelIdentifier || !resolvedRoomIdentifier || !resolvedRoomNumber) {
      throw new UnauthorizedError('Invalid or expired QR token');
    }

    // 2. Query active stay for this room through the port (never direct database join)
    const activeStayRecord = await this.activeStayLookupPort.findActiveStayForRoom(
      resolvedHotelIdentifier,
      resolvedRoomIdentifier
    );

    // If no active stay exists, or if the stay has already checked out, reject with ROOM_NOT_OCCUPIED
    if (!activeStayRecord || activeStayRecord.checkedOutAt) {
      throw new RoomNotOccupiedError(
        `Room ${resolvedRoomNumber} is not currently occupied with an active stay`
      );
    }

    // 3. Issue a new ephemeral guest session
    const generatedSessionIdentifier = randomUUID();
    const currentVerificationTimestamp = this.clock.now();
    const sessionExpirationTimestamp = new Date(
      currentVerificationTimestamp.getTime() + this.sessionTtlSeconds * 1000
    );

    const guestSessionRecord: GuestSession = {
      id: generatedSessionIdentifier,
      hotelId: resolvedHotelIdentifier,
      roomId: resolvedRoomIdentifier,
      roomNumber: resolvedRoomNumber,
      stayId: activeStayRecord.id,
      guestName: activeStayRecord.guestName ?? null,
      status: 'active',
      issuedAt: currentVerificationTimestamp,
      expiresAt: sessionExpirationTimestamp,
    };

    await this.sessionRegistry.save(guestSessionRecord);

    // 4. Sign JWT session claims
    const sessionClaimsRecord: GuestSessionClaims = {
      sub: generatedSessionIdentifier,
      sessionId: generatedSessionIdentifier,
      hotelId: resolvedHotelIdentifier,
      roomId: resolvedRoomIdentifier,
      roomNumber: resolvedRoomNumber,
      stayId: activeStayRecord.id,
      guestName: activeStayRecord.guestName ?? undefined,
      type: 'guest',
    };

    const signedAccessTokenString = this.signGuestTokenCallback(sessionClaimsRecord);

    return {
      token: signedAccessTokenString,
      sessionId: generatedSessionIdentifier,
      hotelId: resolvedHotelIdentifier,
      roomId: resolvedRoomIdentifier,
      roomNumber: resolvedRoomNumber,
      guestName: activeStayRecord.guestName ?? undefined,
      stayId: activeStayRecord.id,
      expiresAt: sessionExpirationTimestamp.toISOString(),
    };
  };

  /**
   * Validates if a session exists, is unexpired, and has not been revoked.
   */
  public validateSession = async (
    sessionIdentifier: string
  ): Promise<GuestSession | undefined> => {
    return this.sessionRegistry.findActiveById(sessionIdentifier, this.clock.now());
  };

  /**
   * Checks boolean validity of an active session.
   */
  public isSessionActive = async (sessionIdentifier: string): Promise<boolean> => {
    const activeSessionRecord = await this.validateSession(sessionIdentifier);
    return activeSessionRecord !== undefined;
  };

  /**
   * Revokes all cached sessions for a given stay (e.g. upon stay.checked_out).
   */
  public revokeSessionsForStay = async (
    stayIdentifier: string,
    revocationReasonDescription: string = 'checked_out'
  ): Promise<string[]> => {
    const revokedSessionIdentifiersList = await this.sessionRegistry.revokeByStayId(
      stayIdentifier,
      revocationReasonDescription,
      this.clock.now()
    );

    // Dispatch guest_session.invalidated events if eventBus is present
    if (this.eventBus) {
      for (const sessionIdentifier of revokedSessionIdentifiersList) {
        const sessionRecord = await this.sessionRegistry.findById(sessionIdentifier);
        if (sessionRecord) {
          await this.eventBus.publish({
            eventName: 'guest_session.invalidated',
            sessionId: sessionRecord.id,
            roomId: sessionRecord.roomId,
            roomNumber: sessionRecord.roomNumber,
            reason: 'checked_out',
          });
        }
      }
    }

    return revokedSessionIdentifiersList;
  };

  /**
   * Revokes all cached sessions for a given room.
   */
  public revokeSessionsForRoom = async (
    roomIdentifier: string,
    revocationReasonDescription: string = 'room_reset'
  ): Promise<string[]> => {
    return this.sessionRegistry.revokeByRoomId(
      roomIdentifier,
      revocationReasonDescription,
      this.clock.now()
    );
  };
}
