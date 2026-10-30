/**
 * WHAT IT DOES:
 * OrderState interface representing the State Pattern contract for order lifecycle management:
 *   PENDING -> IN_PROGRESS -> DELIVERED
 *      \___________\_______-> CANCELLED
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Eliminates scattered conditional branching and switch statements by delegating
 *   transition validation and next-state determination directly to individual state objects.
 * - Arrow functions and descriptive method contracts are used throughout.
 */

import type { OrderStatus } from '../order-status.js';

export interface OrderState {
  readonly status: OrderStatus;

  /** Transitions order from PENDING to IN_PROGRESS. */
  accept(): OrderState;

  /** Transitions order from IN_PROGRESS to DELIVERED. Direct transition from PENDING is forbidden. */
  deliver(): OrderState;

  /** Cancels the order. Only allowed from PENDING or IN_PROGRESS. */
  cancel(): OrderState;

  /** Sequential advancement: accept if PENDING, deliver if IN_PROGRESS. */
  next(): OrderState;
}
