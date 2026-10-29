/**
 * WHAT IT DOES:
 * Implements an in-memory sliding-window rate limiter tracking timestamped request
 * events per key (e.g. guest session ID).
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Fixed-window counter rate limiters allow burst boundary abuse (e.g. sending 60 requests
 *   at 00:59 and another 60 at 01:01, permitting 120 requests in 2 seconds).
 * - A sliding-window algorithm records request timestamps, prunes entries older than
 *   the window duration (default 60 seconds), and strictly bounds requests across any
 *   rolling 60-second window.
 * - Injects `Clock` interface (`SystemClock` in production, `MockClock` in tests)
 *   enabling deterministic time-travel testing without fragile real-time timeouts.
 * - Arrow functions and descriptive variable names are used throughout.
 */

import type { Clock } from '../utils/clock.js';
import { systemClock } from '../utils/clock.js';

export interface RateLimiterOptions {
  readonly maxRequests?: number;
  readonly windowDurationMs?: number;
  readonly clock?: Clock;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly currentCount: number;
  readonly limit: number;
  readonly retryAfterSeconds: number;
  readonly remainingRequests: number;
}

const DEFAULT_MAX_REQUESTS_PER_WINDOW = 60;
const DEFAULT_WINDOW_DURATION_MS = 60 * 1000; // 60 seconds

export class SlidingWindowRateLimiter {
  private readonly maxAllowedRequests: number;
  private readonly windowDurationMs: number;
  private readonly clock: Clock;
  private readonly requestTimestampsByClientKey = new Map<string, number[]>();

  constructor(optionsConfiguration: RateLimiterOptions = {}) {
    this.maxAllowedRequests =
      optionsConfiguration.maxRequests ?? DEFAULT_MAX_REQUESTS_PER_WINDOW;
    this.windowDurationMs =
      optionsConfiguration.windowDurationMs ?? DEFAULT_WINDOW_DURATION_MS;
    this.clock = optionsConfiguration.clock ?? systemClock;
  }

  /**
   * Evaluates if an incoming request identified by `clientKey` is allowed within
   * the sliding time window. Records the timestamp if allowed.
   */
  public isAllowed = (clientIdentifierKey: string): RateLimitDecision => {
    const currentEvaluationTimestamp = this.clock.now().getTime();
    const windowCutoffTimestamp = currentEvaluationTimestamp - this.windowDurationMs;

    const existingTimestampsList =
      this.requestTimestampsByClientKey.get(clientIdentifierKey) ?? [];

    // Filter out timestamps that have slid outside the rolling window
    const activeTimestampsInWindow = existingTimestampsList.filter(
      (recordedTimestamp) => recordedTimestamp > windowCutoffTimestamp
    );

    if (activeTimestampsInWindow.length >= this.maxAllowedRequests) {
      // Calculate how many seconds until the oldest timestamp in the window expires
      const oldestActiveTimestamp =
        activeTimestampsInWindow[0] ?? currentEvaluationTimestamp;
      const millisecondsUntilOldestExpires =
        oldestActiveTimestamp + this.windowDurationMs - currentEvaluationTimestamp;
      const calculatedRetryAfterSeconds = Math.max(
        1,
        Math.ceil(millisecondsUntilOldestExpires / 1000)
      );

      // Save pruned timestamps
      this.requestTimestampsByClientKey.set(
        clientIdentifierKey,
        activeTimestampsInWindow
      );

      return {
        allowed: false,
        currentCount: activeTimestampsInWindow.length,
        limit: this.maxAllowedRequests,
        retryAfterSeconds: calculatedRetryAfterSeconds,
        remainingRequests: 0,
      };
    }

    // Record the current timestamp and store updated window array
    activeTimestampsInWindow.push(currentEvaluationTimestamp);
    this.requestTimestampsByClientKey.set(
      clientIdentifierKey,
      activeTimestampsInWindow
    );

    return {
      allowed: true,
      currentCount: activeTimestampsInWindow.length,
      limit: this.maxAllowedRequests,
      retryAfterSeconds: 0,
      remainingRequests: this.maxAllowedRequests - activeTimestampsInWindow.length,
    };
  };

  /**
   * Returns the count of active requests in the current window for a specific key.
   */
  public getRequestCount = (clientIdentifierKey: string): number => {
    const currentEvaluationTimestamp = this.clock.now().getTime();
    const windowCutoffTimestamp = currentEvaluationTimestamp - this.windowDurationMs;
    const existingTimestampsList =
      this.requestTimestampsByClientKey.get(clientIdentifierKey) ?? [];

    return existingTimestampsList.filter(
      (recordedTimestamp) => recordedTimestamp > windowCutoffTimestamp
    ).length;
  };

  /**
   * Resets rate limit records for a specific client key, or clears all records if no key is provided.
   */
  public reset = (clientIdentifierKey?: string): void => {
    if (clientIdentifierKey) {
      this.requestTimestampsByClientKey.delete(clientIdentifierKey);
    } else {
      this.requestTimestampsByClientKey.clear();
    }
  };
}
