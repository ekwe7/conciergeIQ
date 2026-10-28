/**
 * WHAT IT DOES:
 * Establishes the boundary contract (`ActiveStayLookupPort`) and in-memory test double
 * (`MockActiveStayLookupPort`) for querying whether a given hotel room currently has an
 * active, checked-in stay.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Following hexagonal architecture / ports and adapters, the guest access domain must
 *   never couple directly to the stays database table or SQL schema.
 * - This port decouples session resolution from stay persistence, preventing cross-module
 *   database joins and circular module dependencies.
 * - `MockActiveStayLookupPort` allows unit tests to simulate active, vacant, and checked-out
 *   stays without requiring database transactions or test database seeds.
 * - Arrow functions and descriptive variable names are used throughout.
 */

/**
 * Snapshot of an active stay required for guest session issuance.
 */
export interface ActiveStaySummary {
  readonly id: string;
  readonly hotelId: string;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly guestName?: string | null;
  readonly guestPhone?: string | null;
  readonly checkedInAt: string | Date;
  readonly expectedCheckOutAt: string | Date;
  readonly checkedOutAt?: string | Date | null;
}

/**
 * Secondary port for resolving stay status across module boundaries.
 */
export interface ActiveStayLookupPort {
  findActiveStayForRoom(
    hotelIdentifier: string,
    roomIdentifier: string
  ): Promise<ActiveStaySummary | undefined>;
}

/**
 * In-memory test mock for `ActiveStayLookupPort` supporting unit tests and integration harnesses.
 */
export class MockActiveStayLookupPort implements ActiveStayLookupPort {
  private readonly activeStaysByRoomCompositeKey = new Map<string, ActiveStaySummary>();

  /**
   * Stashes or updates an active stay for a specific hotel and room.
   */
  public setActiveStay = (activeStayToSet: ActiveStaySummary): void => {
    const compositeRoomLookupKey = this.buildCompositeRoomKey(
      activeStayToSet.hotelId,
      activeStayToSet.roomId
    );
    this.activeStaysByRoomCompositeKey.set(compositeRoomLookupKey, activeStayToSet);
  };

  /**
   * Simulates a check-out by marking `checkedOutAt` on the stashed stay.
   */
  public markStayCheckedOut = (
    hotelIdentifier: string,
    roomIdentifier: string,
    checkedOutTimestamp: Date = new Date()
  ): void => {
    const compositeRoomLookupKey = this.buildCompositeRoomKey(
      hotelIdentifier,
      roomIdentifier
    );
    const existingStay = this.activeStaysByRoomCompositeKey.get(compositeRoomLookupKey);
    if (existingStay) {
      this.activeStaysByRoomCompositeKey.set(compositeRoomLookupKey, {
        ...existingStay,
        checkedOutAt: checkedOutTimestamp,
      });
    }
  };

  /**
   * Clears the active stay for a specific room (simulating a vacant room).
   */
  public clearActiveStay = (
    hotelIdentifier: string,
    roomIdentifier: string
  ): void => {
    const compositeRoomLookupKey = this.buildCompositeRoomKey(
      hotelIdentifier,
      roomIdentifier
    );
    this.activeStaysByRoomCompositeKey.delete(compositeRoomLookupKey);
  };

  /**
   * Resets all stored mock stay records.
   */
  public reset = (): void => {
    this.activeStaysByRoomCompositeKey.clear();
  };

  /**
   * Queries the in-memory store for an active stay matching the room.
   * If the stay has a non-null `checkedOutAt`, it is considered inactive and returns undefined.
   */
  public findActiveStayForRoom = async (
    hotelIdentifier: string,
    roomIdentifier: string
  ): Promise<ActiveStaySummary | undefined> => {
    const compositeRoomLookupKey = this.buildCompositeRoomKey(
      hotelIdentifier,
      roomIdentifier
    );
    const candidateStay = this.activeStaysByRoomCompositeKey.get(compositeRoomLookupKey);

    if (!candidateStay) {
      return undefined;
    }

    if (candidateStay.checkedOutAt) {
      return undefined;
    }

    return candidateStay;
  };

  private buildCompositeRoomKey = (
    hotelIdentifier: string,
    roomIdentifier: string
  ): string => `${hotelIdentifier}:${roomIdentifier}`;
}
