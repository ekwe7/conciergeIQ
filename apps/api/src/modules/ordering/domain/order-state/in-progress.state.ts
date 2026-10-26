import { OrderStatus } from '../order-status.js';
import { CancelledState } from './cancelled.state.js';
import { DeliveredState } from './delivered.state.js';
import type { OrderState } from './order-state.js';

export class InProgressState implements OrderState {
  readonly status = OrderStatus.IN_PROGRESS;

  next(): OrderState {
    return new DeliveredState();
  }

  cancel(): OrderState {
    return new CancelledState();
  }
}
