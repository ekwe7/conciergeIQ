/**
 * WHAT IT DOES:
 * Represents the IN_PROGRESS state of an order actively being prepared by kitchen/staff.
 * Allows transition to DELIVERED via `deliver()` or CANCELLED via `cancel()`.
 * Forbids re-acceptance.
 */

import { InvalidStateTransitionError } from '../errors.js';
import { OrderStatus } from '../order-status.js';
import { CancelledState } from './cancelled.state.js';
import { DeliveredState } from './delivered.state.js';
import type { OrderState } from './order-state.js';

export class InProgressState implements OrderState {
  readonly status = OrderStatus.IN_PROGRESS;

  accept(): OrderState {
    throw new InvalidStateTransitionError('Order is already in progress');
  }

  deliver(): OrderState {
    return new DeliveredState();
  }

  cancel(): OrderState {
    return new CancelledState();
  }

  next(): OrderState {
    return this.deliver();
  }
}
