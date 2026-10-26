import { InvalidOrderTransitionError } from '../errors.js';
import { OrderStatus } from '../order-status.js';
import type { OrderState } from './order-state.js';

export class CancelledState implements OrderState {
  readonly status = OrderStatus.CANCELLED;

  next(): OrderState {
    throw new InvalidOrderTransitionError('This order was cancelled');
  }

  cancel(): OrderState {
    throw new InvalidOrderTransitionError('This order was already cancelled');
  }
}
