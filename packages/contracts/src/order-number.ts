/** Formats an order number the way staff and guests see it, for example `A-1042`. */
export function formatOrderNumber(orderNumber: number): string {
  return `A-${orderNumber}`;
}
