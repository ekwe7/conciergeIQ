import type { OrderStatus } from '../order-status.js';

/**
 * One state of an order's lifecycle. Each state knows which moves it allows,
 * so the rules live in one place per status instead of in a switch statement.
 *
 *   PENDING -> IN_PROGRESS -> DELIVERED
 *      \___________\_______-> CANCELLED
 */
export interface OrderState {
  readonly status: OrderStatus;
  /** The state after the next step: accept, then deliver. */
  next(): OrderState;
  cancel(): OrderState;
}
