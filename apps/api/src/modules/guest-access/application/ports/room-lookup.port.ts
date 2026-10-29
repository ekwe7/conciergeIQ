/**
 * WHAT IT DOES:
 * Defines the contract (`RoomLookupPort`) and in-memory test double (`MockRoomLookupPort`)
 * for looking up room identity and status when resolving guest access.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Decouples guest access from the rooms database schema and repositories.
 * - Allows looking up a room either by opaque legacy QR token or validating that a room
 *   referenced inside a cryptographic token is operational (not out of order).
 * - Arrow functions and descriptive variable names are used throughout.
 */

/**
 * Summary of room metadata required by the guest access module.
 */
export interface RoomSummaryForGuestAccess {
  readonly id: string;
  readonly hotelId: string;
  readonly number: string;
  readonly isOutOfOrder: boolean;
}

/**
 * Secondary port for room querying from guest access.
 */
export interface RoomLookupPort {
  findRoomById(
    hotelIdentifier: string,
    roomIdentifier: string
  ): Promise<RoomSummaryForGuestAccess | undefined>;

  findRoomByQrToken?(
    rawQrTokenString: string
  ): Promise<RoomSummaryForGuestAccess | undefined>;
}

/**
 * In-memory test mock for `RoomLookupPort`.
 */
export class MockRoomLookupPort implements RoomLookupPort {
  private readonly roomsByIdCompositeKey = new Map<string, RoomSummaryForGuestAccess>();
  private readonly roomsByQrTokenMap = new Map<string, RoomSummaryForGuestAccess>();

  public setRoom = (
    roomSummaryToStore: RoomSummaryForGuestAccess,
    optionalAssociatedQrToken?: string
  ): void => {
    const compositeRoomLookupKey = this.buildCompositeRoomKey(
      roomSummaryToStore.hotelId,
      roomSummaryToStore.id
    );
    this.roomsByIdCompositeKey.set(compositeRoomLookupKey, roomSummaryToStore);

    if (optionalAssociatedQrToken) {
      this.roomsByQrTokenMap.set(optionalAssociatedQrToken, roomSummaryToStore);
    }
  };

  public findRoomById = async (
    hotelIdentifier: string,
    roomIdentifier: string
  ): Promise<RoomSummaryForGuestAccess | undefined> => {
    const compositeRoomLookupKey = this.buildCompositeRoomKey(
      hotelIdentifier,
      roomIdentifier
    );
    return this.roomsByIdCompositeKey.get(compositeRoomLookupKey);
  };

  public findRoomByQrToken = async (
    rawQrTokenString: string
  ): Promise<RoomSummaryForGuestAccess | undefined> => {
    return this.roomsByQrTokenMap.get(rawQrTokenString);
  };

  public reset = (): void => {
    this.roomsByIdCompositeKey.clear();
    this.roomsByQrTokenMap.clear();
  };

  private buildCompositeRoomKey = (
    hotelIdentifier: string,
    roomIdentifier: string
  ): string => `${hotelIdentifier}:${roomIdentifier}`;
}
