/**
 * WHAT IT DOES:
 * Represents the DELIVERED terminal state of an order successfully delivered to the guest room.
 * Forbids any state transitions, throwing `TerminalStateError`.
 */

import { TerminalStateError } from '../errors.js';
import { OrderStatus } from '../order-status.js';
import type { OrderState } from './order-state.js';

export class DeliveredState implements OrderState {
  readonly status = OrderStatus.DELIVERED;

  accept(): OrderState {
    throw new TerminalStateError('This order has already been delivered');
  }

  deliver(): OrderState {
    throw new TerminalStateError('This order has already been delivered');
  }

  cancel(): OrderState {
    throw new TerminalStateError('A delivered order cannot be cancelled');
  }

  next(): OrderState {
    throw new TerminalStateError('This order has already been delivered');
  }
}
