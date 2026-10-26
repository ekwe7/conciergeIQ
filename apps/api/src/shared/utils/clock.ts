/** Where "now" comes from. Inject a fixed clock in tests instead of calling `new Date()`. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
