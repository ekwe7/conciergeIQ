/** A business rule said no, for example delivering an order that was cancelled. Becomes a 409. */
export class DomainRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainRuleError';
  }
}
