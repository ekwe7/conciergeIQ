import type { DomainEvent, DomainEventName, DomainEventOf } from '@conciergeiq/contracts';

/** Delivery details a subscriber can use to stay idempotent. */
export interface EventDelivery {
  eventId: string;
}

type Handler<Event extends DomainEvent> = (event: Event, delivery: EventDelivery) => Promise<void> | void;

/**
 * In-process publish/subscribe. Events reach it through the outbox, so a
 * handler may see the same event twice and must be safe to re-run.
 */
export class EventBus {
  private readonly handlers = new Map<DomainEventName, Handler<DomainEvent>[]>();
  private readonly catchAllHandlers: Handler<DomainEvent>[] = [];

  subscribe<Name extends DomainEventName>(eventName: Name, handler: Handler<DomainEventOf<Name>>): void {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler as Handler<DomainEvent>);
    this.handlers.set(eventName, handlers);
  }

  subscribeToAll(handler: Handler<DomainEvent>): void {
    this.catchAllHandlers.push(handler);
  }

  async publish(event: DomainEvent, delivery: EventDelivery): Promise<void> {
    const handlers = [...(this.handlers.get(event.eventName) ?? []), ...this.catchAllHandlers];
    for (const handler of handlers) {
      await handler(event, delivery);
    }
  }
}
