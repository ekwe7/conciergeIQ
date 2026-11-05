/**
 * WHAT IT DOES:
 * Represents the PENDING state of an order immediately after placement.
 * Allows transition to IN_PROGRESS via `accept()` or CANCELLED via `cancel()`.
 * Forbids direct transition to DELIVERED.
 */

import { InvalidStateTransitionError } from '../errors.js';
import { OrderStatus } from '../order-status.js';
import { CancelledState } from './cancelled.state.js';
import { InProgressState } from './in-progress.state.js';
import type { OrderState } from './order-state.js';

export class PendingState implements OrderState {
  readonly status = OrderStatus.PENDING;

  accept(): OrderState {
    return new InProgressState();
  }

  deliver(): OrderState {
    throw new InvalidStateTransitionError(
      'Cannot transition from PENDING directly to DELIVERED; order must be accepted first'
    );
  }

  cancel(): OrderState {
    return new CancelledState();
  }

  next(): OrderState {
    return this.accept();
  }
}
