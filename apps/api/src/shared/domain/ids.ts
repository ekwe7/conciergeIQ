/**
 * WHAT IT DOES:
 * Implements compile-time nominal/branded types for domain identifiers (`HotelId`, `RoomId`, `OrderId`, etc.)
 * alongside runtime validation constructors.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - TypeScript uses a structural type system. Without branding, a function `assignOrderToRoom(orderId: string, roomId: string)`
 *   will compile without errors if you accidentally swap the arguments: `assignOrderToRoom(roomId, orderId)`.
 * - By attaching a unique symbol `[__nominalBrandSymbol]`, TypeScript treats each ID as an incompatible type at compile time.
 * - `createValidatedBrandedId()` ensures IDs are validated at runtime (rejecting empty strings or whitespace) before casting.
 * - Pure TypeScript with zero runtime overhead—the brand symbol exists only during compilation.
 */
declare const __nominalBrandSymbol: unique symbol;

export type Branded<BaseType, BrandTag extends string> = BaseType & { readonly [__nominalBrandSymbol]: BrandTag };

export type HotelId = Branded<string, 'HotelId'>;
export type RoomId = Branded<string, 'RoomId'>;
export type OrderId = Branded<string, 'OrderId'>;
export type StayId = Branded<string, 'StayId'>;
export type GuestSessionId = Branded<string, 'GuestSessionId'>;

/**
 * Validates that an incoming raw identifier is a non-empty string and brands it.
 */
const createValidatedBrandedId = <BrandTag extends string>(
  rawIdentifierString: string,
  entityTypeName: string
): Branded<string, BrandTag> => {
  if (!rawIdentifierString || typeof rawIdentifierString !== 'string' || rawIdentifierString.trim().length === 0) {
    throw new Error(`Invalid identifier: ${entityTypeName} cannot be empty.`);
  }
  return rawIdentifierString.trim() as Branded<string, BrandTag>;
};

export const createHotelId = (hotelIdString: string): HotelId =>
  createValidatedBrandedId(hotelIdString, 'HotelId');

export const createRoomId = (roomIdString: string): RoomId =>
  createValidatedBrandedId(roomIdString, 'RoomId');

export const createOrderId = (orderIdString: string): OrderId =>
  createValidatedBrandedId(orderIdString, 'OrderId');

export const createStayId = (stayIdString: string): StayId =>
  createValidatedBrandedId(stayIdString, 'StayId');

export const createGuestSessionId = (guestSessionIdString: string): GuestSessionId =>
  createValidatedBrandedId(guestSessionIdString, 'GuestSessionId');
