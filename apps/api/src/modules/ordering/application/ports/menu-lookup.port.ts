/** A menu item as the menu module prices it right now. */
export interface MenuItemPrice {
  id: string;
  name: string;
  priceMinor: number;
  isAvailable: boolean;
}

export interface MenuLookup {
  findItems(hotelId: string, itemIds: string[]): Promise<MenuItemPrice[]>;
}
