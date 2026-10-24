import { InvalidOrderTransitionError } from '../errors.js';
import { OrderStatus } from '../order-status.js';
import type { OrderState } from './order-state.js';

export class DeliveredState implements OrderState {
  readonly status = OrderStatus.DELIVERED;

  next(): OrderState {
    throw new InvalidOrderTransitionError('This order has already been delivered');
  }

  cancel(): OrderState {
    throw new InvalidOrderTransitionError('A delivered order cannot be cancelled');
  }
}
