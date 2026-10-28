/**
 * WHAT IT DOES:
 * Defines a `Clock` interface with production (`SystemClock`) and testing (`MockClock`) implementations.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Calling `new Date()` or `Date.now()` directly inside domain logic makes tests non-deterministic 
 *   (e.g., verifying if an order escalation triggers after 2 minutes or testing timed menu availability).
 * - Injecting `Clock` allows unit tests to freeze time, advance time deterministically via `advanceByMs()`, 
 *   or simulate specific edge-case dates without relying on brittle fake timers.
 * - `MockClock` returns a new `Date` object each time to avoid callers mutating the internal clock reference.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  public now = (): Date => new Date();
}

export const systemClock: Clock = new SystemClock();

export class MockClock implements Clock {
  private simulatedCurrentTime: Date;

  constructor(initialClockTime: Date = new Date()) {
    this.simulatedCurrentTime = new Date(initialClockTime.getTime());
  }

  public now = (): Date => new Date(this.simulatedCurrentTime.getTime());

  public setTime = (targetDateTime: Date): void => {
    this.simulatedCurrentTime = new Date(targetDateTime.getTime());
  };

  public advanceByMs = (millisecondsToAdvance: number): void => {
    this.simulatedCurrentTime = new Date(this.simulatedCurrentTime.getTime() + millisecondsToAdvance);
  };
}

export const createMockClock = (initialClockTime?: Date): MockClock =>
  new MockClock(initialClockTime);
