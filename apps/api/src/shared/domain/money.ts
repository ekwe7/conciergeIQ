/**
 * Money is stored as whole minor units (kobo, cents) so sums are exact.
 * The API and events use major units (naira, dollars) with up to two decimals.
 */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function toMajorUnits(minorUnits: number): number {
  return minorUnits / 100;
}
