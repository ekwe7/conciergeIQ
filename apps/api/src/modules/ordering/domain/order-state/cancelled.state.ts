/**
 * WHAT IT DOES:
 * Represents the CANCELLED terminal state of an order cancelled by guest or staff.
 * Forbids any state transitions, throwing `TerminalStateError`.
 */

import { TerminalStateError } from '../errors.js';
import { OrderStatus } from '../order-status.js';
import type { OrderState } from './order-state.js';

export class CancelledState implements OrderState {
  readonly status = OrderStatus.CANCELLED;

  accept(): OrderState {
    throw new TerminalStateError('This order was cancelled');
  }

  deliver(): OrderState {
    throw new TerminalStateError('This order was cancelled');
  }

  cancel(): OrderState {
    throw new TerminalStateError('This order was already cancelled');
  }

  next(): OrderState {
    throw new TerminalStateError('This order was cancelled');
  }
}
