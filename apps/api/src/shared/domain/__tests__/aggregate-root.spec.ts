import { describe, it, expect } from 'vitest';
import { AggregateRoot } from '../aggregate-root.js';
import type { DomainEvent } from '../domain-event.js';
import { createOrderId, type OrderId } from '../ids.js';

interface TestOrderCreatedEvent extends DomainEvent {
  readonly eventName: 'order.created';
  readonly orderId: string;
}

class TestOrderAggregate extends AggregateRoot<OrderId> {
  private constructor(aggregateIdentifier: OrderId) {
    super(aggregateIdentifier);
  }

  public static create = (orderIdentifierString: string): TestOrderAggregate => {
    const brandedOrderId = createOrderId(orderIdentifierString);
    const createdOrderAggregate = new TestOrderAggregate(brandedOrderId);
    createdOrderAggregate.addDomainEvent({
      eventId: 'evt-123',
      occurredOn: new Date(),
      eventName: 'order.created',
      orderId: orderIdentifierString,
    } as TestOrderCreatedEvent);
    return createdOrderAggregate;
  };

  public recordCustomEvent = (domainEventToRecord: DomainEvent): void => {
    this.addDomainEvent(domainEventToRecord);
  };
}

describe('AggregateRoot Primitive', () => {
  it('instantiates aggregate with identity and accumulates domain events', () => {
    const createdOrderAggregate = TestOrderAggregate.create('ord_999');

    expect(createdOrderAggregate.id).toBe('ord_999');
    expect(createdOrderAggregate.domainEvents).toHaveLength(1);
    expect(createdOrderAggregate.domainEvents[0].eventName).toBe('order.created');
  });

  it('guarantees immutability of the domainEvents getter', () => {
    const createdOrderAggregate = TestOrderAggregate.create('ord_100');
    const clonedDomainEventsList = createdOrderAggregate.domainEvents;

    expect(Object.isFrozen(clonedDomainEventsList)).toBe(true);
    expect(() => {
      (clonedDomainEventsList as unknown as DomainEvent[]).push({
        eventId: 'rogue-event',
        occurredOn: new Date(),
        eventName: 'rogue',
      });
    }).toThrow();
  });

  it('clears domain events deterministically via clearDomainEvents', () => {
    const createdOrderAggregate = TestOrderAggregate.create('ord_200');

    expect(createdOrderAggregate.domainEvents).toHaveLength(1);
    createdOrderAggregate.clearDomainEvents();
    expect(createdOrderAggregate.domainEvents).toHaveLength(0);
  });

  it('throws an error if attempting to add null or undefined domain event', () => {
    const createdOrderAggregate = TestOrderAggregate.create('ord_300');

    expect(() => {
      createdOrderAggregate.recordCustomEvent(null as unknown as DomainEvent);
    }).toThrow(/Domain event cannot be null or undefined/);

    expect(() => {
      createdOrderAggregate.recordCustomEvent(undefined as unknown as DomainEvent);
    }).toThrow(/Domain event cannot be null or undefined/);
  });

  it('inherits entity identity-based equality', () => {
    const primaryOrderWithSameId = TestOrderAggregate.create('ord_same');
    const duplicateOrderWithSameId = TestOrderAggregate.create('ord_same');
    const distinctOrderWithDifferentId = TestOrderAggregate.create('ord_different');

    expect(primaryOrderWithSameId.equals(duplicateOrderWithSameId)).toBe(true);
    expect(primaryOrderWithSameId.equals(distinctOrderWithDifferentId)).toBe(false);
    expect(primaryOrderWithSameId.equals(null)).toBe(false);
  });
});
