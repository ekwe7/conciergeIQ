import { DomainRuleError } from '../../../shared/domain/domain-rule-error.js';

export class InvalidOrderTransitionError extends DomainRuleError {}

export class EmptyOrderError extends DomainRuleError {
  constructor() {
    super('An order needs at least one item');
  }
}
