import type { DomainEvent, DomainEventName, DomainEventOf } from '@conciergeiq/contracts';

/**
 * WHAT IT DOES:
 * Represents the contextual metadata accompanying an event delivery.
 * Contains the unique event delivery identifier used by subscribers to maintain idempotency.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - In distributed and outbox-driven systems, events may be delivered more than once (at-least-once delivery).
 * - Subscribers receive this context to record processed event IDs and prevent duplicate processing.
 */
export interface EventDelivery {
  readonly eventId: string;
}

export type EventDeliveryContext = EventDelivery;

/**
 * Function signature for a domain event subscriber callback.
 */
export type EventHandler<TargetEvent extends DomainEvent = DomainEvent> = (
  domainEvent: TargetEvent,
  deliveryContext: EventDelivery
) => Promise<void> | void;

/**
 * WHAT IT DOES:
 * Registry managing event subscription registrations mapped by domain event name
 * alongside catch-all global subscribers.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Separating subscription storage from dispatch logic respects the Single Responsibility Principle.
 * - Allows subscribers to be inspected, counted, or cleared in testing environments without polluting the bus.
 */
export class SubscriberRegistry {
  private readonly specificEventHandlers = new Map<string, EventHandler<DomainEvent>[]>();
  private readonly globalEventHandlers: EventHandler<DomainEvent>[] = [];

  public registerSubscriber = <TargetEvent extends DomainEvent = DomainEvent>(
    targetEventName: string,
    eventSubscriberCallback: EventHandler<TargetEvent>
  ): void => {
    const existingHandlers = this.specificEventHandlers.get(targetEventName) ?? [];
    existingHandlers.push(eventSubscriberCallback as EventHandler<DomainEvent>);
    this.specificEventHandlers.set(targetEventName, existingHandlers);
  };

  public registerGlobalSubscriber = (globalSubscriberCallback: EventHandler<DomainEvent>): void => {
    this.globalEventHandlers.push(globalSubscriberCallback);
  };

  public getSubscribersForEvent = (targetEventName: string): ReadonlyArray<EventHandler<DomainEvent>> => {
    const matchedSpecificHandlers = this.specificEventHandlers.get(targetEventName) ?? [];
    return [...matchedSpecificHandlers, ...this.globalEventHandlers];
  };

  public clearAllSubscribers = (): void => {
    this.specificEventHandlers.clear();
    this.globalEventHandlers.length = 0;
  };

  public get totalSubscriberCount(): number {
    let totalCount = this.globalEventHandlers.length;
    for (const handlerList of this.specificEventHandlers.values()) {
      totalCount += handlerList.length;
    }
    return totalCount;
  }
}

/**
 * WHAT IT DOES:
 * In-memory, typed, asynchronous Publish/Subscribe Event Bus.
 * Dispatches domain events to registered handlers with strict error isolation between subscribers.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Decouples domain event dispatching from side-effect handling (e.g., real-time WebSocket push, audit log recording).
 * - Error Isolation: An unhandled rejection or exception in Subscriber A must NEVER abort execution or prevent 
 *   Subscriber B from receiving the event.
 * - Uses `Promise.allSettled` to execute all subscribers concurrently while capturing any failures.
 * - Preserves exact compatibility with existing codebase contracts and outbox dispatchers.
 */
export class EventBus {
  private readonly subscriberRegistry: SubscriberRegistry;
  private readonly subscriberFailureLogger?: (capturedError: unknown, failedEvent: DomainEvent) => void;

  constructor(
    customRegistry: SubscriberRegistry = new SubscriberRegistry(),
    failureLogger?: (capturedError: unknown, failedEvent: DomainEvent) => void
  ) {
    this.subscriberRegistry = customRegistry;
    this.subscriberFailureLogger = failureLogger;
  }

  /**
   * Subscribes a strongly-typed handler to a specific domain event by name.
   */
  public subscribe = <TargetEventName extends DomainEventName>(
    targetEventName: TargetEventName,
    eventSubscriberCallback: EventHandler<DomainEventOf<TargetEventName>>
  ): void => {
    this.subscriberRegistry.registerSubscriber(targetEventName, eventSubscriberCallback);
  };

  /**
   * Subscribes a catch-all handler that receives all published domain events.
   */
  public subscribeToAll = (globalSubscriberCallback: EventHandler<DomainEvent>): void => {
    this.subscriberRegistry.registerGlobalSubscriber(globalSubscriberCallback);
  };

  /**
   * Asynchronously publishes a domain event to all registered matching subscribers and global handlers.
   * Guarantees that every subscriber executes even if a preceding subscriber throws an error.
   */
  public publish = async (
    publishedDomainEvent: DomainEvent,
    eventDeliveryContext: EventDelivery
  ): Promise<void> => {
    const applicableSubscribers = this.subscriberRegistry.getSubscribersForEvent(
      publishedDomainEvent.eventName
    );

    if (applicableSubscribers.length === 0) {
      return;
    }

    const subscriberExecutionPromises = applicableSubscribers.map(async (currentSubscriber) => {
      try {
        await currentSubscriber(publishedDomainEvent, eventDeliveryContext);
      } catch (unhandledSubscriberError) {
        if (this.subscriberFailureLogger) {
          this.subscriberFailureLogger(unhandledSubscriberError, publishedDomainEvent);
        }
        // Error is isolated: swallowed here so Promise.allSettled completes without aborting peer handlers
        throw unhandledSubscriberError;
      }
    });

    await Promise.allSettled(subscriberExecutionPromises);
  };

  public clearSubscribers = (): void => {
    this.subscriberRegistry.clearAllSubscribers();
  };
}
