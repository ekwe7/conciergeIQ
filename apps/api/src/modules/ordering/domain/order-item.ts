/** One line of an order. Name and price are copied from the menu, so old orders stay correct when prices change. */
export interface OrderItem {
  itemId: string;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  notes?: string;
}

export function subtotalOf(item: OrderItem): number {
  return item.unitPriceMinor * item.quantity;
}
