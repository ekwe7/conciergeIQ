import { OrderStatus } from '../order-status.js';
import { CancelledState } from './cancelled.state.js';
import { InProgressState } from './in-progress.state.js';
import type { OrderState } from './order-state.js';

export class PendingState implements OrderState {
  readonly status = OrderStatus.PENDING;

  next(): OrderState {
    return new InProgressState();
  }

  cancel(): OrderState {
    return new CancelledState();
  }
}
