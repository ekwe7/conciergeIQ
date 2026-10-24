import type { Clock } from '../../src/shared/utils/clock.js';

/** A clock that only moves when a test moves it. */
export class TestClock implements Clock {
  private current: Date;

  constructor(start = '2026-10-24T09:00:00.000Z') {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }

  /** An ISO time this many days after now, for things like expected departure. */
  daysFromNow(days: number): string {
    return new Date(this.current.getTime() + days * 24 * 60 * 60_000).toISOString();
  }
}
