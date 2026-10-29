/**
 * WHAT IT DOES:
 * Public domain API of the ordering module.
 */

export { Order, type OrderProps, type StatusChange } from './order.aggregate.js';
export { OrderStatus } from './order-status.js';
export { subtotalOf, type OrderItem } from './order-item.js';
export {
  EmptyOrderError,
  InvalidOrderTransitionError,
  InvalidStateTransitionError,
  TerminalStateError,
} from './errors.js';
export type { OrderState } from './order-state/order-state.js';
export { PendingState } from './order-state/pending.state.js';
export { InProgressState } from './order-state/in-progress.state.js';
export { DeliveredState } from './order-state/delivered.state.js';
export { CancelledState } from './order-state/cancelled.state.js';
export { stateForStatus } from './order-state/state-for-status.js';
