/**
 * WHAT IT DOES:
 * Defines domain models, state representations, and an in-memory session registry
 * (`InMemoryGuestSessionRegistry`) managing the lifecycle of authorized guest sessions.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - A guest session is ephemeral: it grants ordering privileges to a specific room and active stay.
 * - When a guest checks out, all existing guest sessions for that stay must be instantly revoked,
 *   invalidating any cached tokens or active connections.
 * - `InMemoryGuestSessionRegistry` provides O(1) session lookups by `sessionId` as well as
 *   indexed lookups by `stayId` and `roomId` for atomic bulk revocation on checkout.
 * - Arrow functions and descriptive variable names are used throughout.
 */

export type GuestSessionState = 'active' | 'revoked' | 'expired';

/**
 * Claims contained within an issued guest access JWT token.
 */
export interface GuestSessionClaims {
  readonly sub: string;
  readonly sessionId: string;
  readonly hotelId: string;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly stayId: string;
  readonly guestName?: string;
  readonly type: 'guest';
}

/**
 * In-memory representation of an active or revoked guest session.
 */
export interface GuestSession {
  readonly id: string;
  readonly hotelId: string;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly stayId: string;
  readonly guestName?: string | null;
  readonly status: GuestSessionState;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt?: Date | null;
  readonly revocationReason?: string | null;
}

/**
 * Repository interface for storing, querying, and revoking guest sessions.
 */
export interface GuestSessionRegistry {
  save(guestSessionRecord: GuestSession): Promise<void>;
  findById(guestSessionIdentifier: string): Promise<GuestSession | undefined>;
  findActiveById(
    guestSessionIdentifier: string,
    currentVerificationTime: Date
  ): Promise<GuestSession | undefined>;
  revokeByStayId(
    stayIdentifier: string,
    revocationReasonDescription: string,
    revokedAtTimestamp: Date
  ): Promise<string[]>;
  revokeByRoomId(
    roomIdentifier: string,
    revocationReasonDescription: string,
    revokedAtTimestamp: Date
  ): Promise<string[]>;
}

/**
 * In-memory thread-safe implementation of `GuestSessionRegistry`.
 */
export class InMemoryGuestSessionRegistry implements GuestSessionRegistry {
  private readonly sessionsByIdentityMap = new Map<string, GuestSession>();
  private readonly sessionIdentifiersByStayMap = new Map<string, Set<string>>();
  private readonly sessionIdentifiersByRoomMap = new Map<string, Set<string>>();

  public save = async (guestSessionRecord: GuestSession): Promise<void> => {
    this.sessionsByIdentityMap.set(guestSessionRecord.id, guestSessionRecord);

    const existingStaySessionsSet =
      this.sessionIdentifiersByStayMap.get(guestSessionRecord.stayId) ?? new Set<string>();
    existingStaySessionsSet.add(guestSessionRecord.id);
    this.sessionIdentifiersByStayMap.set(
      guestSessionRecord.stayId,
      existingStaySessionsSet
    );

    const existingRoomSessionsSet =
      this.sessionIdentifiersByRoomMap.get(guestSessionRecord.roomId) ?? new Set<string>();
    existingRoomSessionsSet.add(guestSessionRecord.id);
    this.sessionIdentifiersByRoomMap.set(
      guestSessionRecord.roomId,
      existingRoomSessionsSet
    );
  };

  public findById = async (
    guestSessionIdentifier: string
  ): Promise<GuestSession | undefined> => {
    return this.sessionsByIdentityMap.get(guestSessionIdentifier);
  };

  public findActiveById = async (
    guestSessionIdentifier: string,
    currentVerificationTime: Date
  ): Promise<GuestSession | undefined> => {
    const candidateSession = this.sessionsByIdentityMap.get(guestSessionIdentifier);

    if (!candidateSession) {
      return undefined;
    }

    if (candidateSession.status === 'revoked') {
      return undefined;
    }

    if (candidateSession.expiresAt.getTime() <= currentVerificationTime.getTime()) {
      return undefined;
    }

    return candidateSession;
  };

  public revokeByStayId = async (
    stayIdentifier: string,
    revocationReasonDescription: string,
    revokedAtTimestamp: Date
  ): Promise<string[]> => {
    const associatedSessionIdentifiers =
      this.sessionIdentifiersByStayMap.get(stayIdentifier);
    if (!associatedSessionIdentifiers || associatedSessionIdentifiers.size === 0) {
      return [];
    }

    const revokedSessionIdentifiersList: string[] = [];

    for (const sessionIdentifier of associatedSessionIdentifiers) {
      const activeSessionRecord = this.sessionsByIdentityMap.get(sessionIdentifier);
      if (activeSessionRecord && activeSessionRecord.status !== 'revoked') {
        const revokedSessionRecord: GuestSession = {
          ...activeSessionRecord,
          status: 'revoked',
          revokedAt: revokedAtTimestamp,
          revocationReason: revocationReasonDescription,
        };
        this.sessionsByIdentityMap.set(sessionIdentifier, revokedSessionRecord);
        revokedSessionIdentifiersList.push(sessionIdentifier);
      }
    }

    return revokedSessionIdentifiersList;
  };

  public revokeByRoomId = async (
    roomIdentifier: string,
    revocationReasonDescription: string,
    revokedAtTimestamp: Date
  ): Promise<string[]> => {
    const associatedSessionIdentifiers =
      this.sessionIdentifiersByRoomMap.get(roomIdentifier);
    if (!associatedSessionIdentifiers || associatedSessionIdentifiers.size === 0) {
      return [];
    }

    const revokedSessionIdentifiersList: string[] = [];

    for (const sessionIdentifier of associatedSessionIdentifiers) {
      const activeSessionRecord = this.sessionsByIdentityMap.get(sessionIdentifier);
      if (activeSessionRecord && activeSessionRecord.status !== 'revoked') {
        const revokedSessionRecord: GuestSession = {
          ...activeSessionRecord,
          status: 'revoked',
          revokedAt: revokedAtTimestamp,
          revocationReason: revocationReasonDescription,
        };
        this.sessionsByIdentityMap.set(sessionIdentifier, revokedSessionRecord);
        revokedSessionIdentifiersList.push(sessionIdentifier);
      }
    }

    return revokedSessionIdentifiersList;
  };

  public clear = (): void => {
    this.sessionsByIdentityMap.clear();
    this.sessionIdentifiersByStayMap.clear();
    this.sessionIdentifiersByRoomMap.clear();
  };
}
