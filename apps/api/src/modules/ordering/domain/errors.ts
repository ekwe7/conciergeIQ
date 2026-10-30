/**
 * WHAT IT DOES:
 * Domain exception classes for Order lifecycle state machine rule violations.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Extends `DomainRuleError` to clearly signal business rule violations.
 * - `InvalidStateTransitionError` is thrown when an invalid transition between active states is attempted
 *   (e.g., jumping from PENDING directly to DELIVERED).
 * - `TerminalStateError` is thrown when any mutation or state movement is attempted on an order
 *   already in a terminal state (DELIVERED or CANCELLED).
 * - `InvalidOrderTransitionError` is retained as a subclass for backward compatibility with existing handlers.
 */

import { DomainRuleError } from '../../../shared/domain/domain-rule-error.js';

export class InvalidStateTransitionError extends DomainRuleError {
  constructor(message = 'Invalid state transition') {
    super(message);
  }
}

export class InvalidOrderTransitionError extends InvalidStateTransitionError {}

export class TerminalStateError extends InvalidOrderTransitionError {
  constructor(message = 'Cannot transition an order in a terminal state') {
    super(message);
  }
}

export class EmptyOrderError extends DomainRuleError {
  constructor(message = 'An order needs at least one item') {
    super(message);
  }
}
