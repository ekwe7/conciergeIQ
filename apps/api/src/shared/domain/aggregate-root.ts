import { Entity } from './entity.js';
import type { DomainEvent } from './domain-event.js';

/**
 * WHAT IT DOES:
 * Represents the primary boundary and entry-point entity of a domain aggregate cluster (e.g., `Order`, `GuestStay`).
 * Extends `Entity` and adds an internal, private collection pipeline for domain events.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Aggregate roots enforce domain invariants and stage side-effect events internally.
 * - `_recordedDomainEvents` is kept strictly private: external callers cannot push arbitrary events.
 * - `addDomainEvent()` is `protected` so only methods within the aggregate root subclass can record events.
 * - `domainEvents` getter returns a shallow copy wrapped in `Object.freeze()`. This prevents 
 *   external layers (e.g., repositories or event dispatchers) from mutating or clearing the aggregate's 
 *   internal queue without calling `clearDomainEvents()`.
 * - `clearDomainEvents()` enables unit-of-work dispatchers to drain events cleanly after 
 *   committing a database transaction.
 */
export abstract class AggregateRoot<AggregateIdentifierType> extends Entity<AggregateIdentifierType> {
  private _recordedDomainEvents: DomainEvent[] = [];

  protected constructor(aggregateIdentifier: AggregateIdentifierType) {
    super(aggregateIdentifier);
  }

  public get domainEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this._recordedDomainEvents]);
  }

  protected addDomainEvent(occurredDomainEvent: DomainEvent): void {
    if (!occurredDomainEvent) {
      throw new Error('Domain event cannot be null or undefined.');
    }
    this._recordedDomainEvents.push(occurredDomainEvent);
  }

  public clearDomainEvents(): void {
    this._recordedDomainEvents = [];
  }

  public pullDomainEvents(): ReadonlyArray<DomainEvent> {
    const recordedEvents = [...this._recordedDomainEvents];
    this._recordedDomainEvents = [];
    return Object.freeze(recordedEvents);
  }
}
