import { describe, it, expect, vi } from 'vitest';
import type { OrderCreatedEvent } from '@conciergeiq/contracts';
import { EventBus, SubscriberRegistry, type EventDelivery } from '../event-bus.js';
import { InMemoryOutboxRepository } from '../outbox.repository.js';
import { AggregateRoot } from '../../domain/aggregate-root.js';
import { createOrderId, type OrderId } from '../../domain/ids.js';
import type { DomainEvent } from '../../domain/domain-event.js';

/**
 * WHAT IT DOES:
 * Unit test suite verifying the in-memory EventBus, SubscriberRegistry, and InMemoryOutboxRepository.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Validates multi-subscriber independent delivery, ensuring all listeners are notified.
 * - Validates error isolation: one failing subscriber must never prevent peer subscribers from executing.
 * - Validates integration with AggregateRoot event extraction.
 * - Executes high-volume stress testing (1,000 synthetic events) to confirm throughput and zero event loss.
 */

describe('In-Memory Event Bus & Transactional Outbox', () => {
  const createSyntheticOrderCreatedEvent = (orderSequenceNumber: number): OrderCreatedEvent => ({
    eventName: 'order.created',
    orderId: `ord_synthetic_${orderSequenceNumber}`,
    orderNumber: orderSequenceNumber,
    hotelId: 'htl_lagos_continental',
    roomId: 'rm_executive_suite_301',
    roomNumber: '301',
    items: [
      {
        itemId: 'item_club_sandwich',
        name: 'Club Sandwich',
        quantity: 1,
        unitPrice: 2500,
      },
    ],
    totalAmount: 2500,
    status: 'PENDING',
    occurredAt: new Date().toISOString(),
    actor: { type: 'guest', roomNumber: '301' },
  });

  const createDeliveryContext = (eventIdentifierString: string): EventDelivery => ({
    eventId: eventIdentifierString,
  });

  describe('Multi-Subscriber Independent Delivery', () => {
    it('notifies multiple subscribers independently for the identical event name', async () => {
      const eventBusInstance = new EventBus();
      const firstKitchenDisplayEvents: OrderCreatedEvent[] = [];
      const secondAuditLedgerEvents: OrderCreatedEvent[] = [];

      eventBusInstance.subscribe('order.created', (receivedOrderEvent: OrderCreatedEvent) => {
        firstKitchenDisplayEvents.push(receivedOrderEvent);
      });

      eventBusInstance.subscribe('order.created', (receivedOrderEvent: OrderCreatedEvent) => {
        secondAuditLedgerEvents.push(receivedOrderEvent);
      });

      const syntheticOrderEvent = createSyntheticOrderCreatedEvent(101);
      const sampleDeliveryContext = createDeliveryContext('delivery_test_101');

      await eventBusInstance.publish(syntheticOrderEvent, sampleDeliveryContext);

      expect(firstKitchenDisplayEvents).toHaveLength(1);
      expect(firstKitchenDisplayEvents[0].orderId).toBe('ord_synthetic_101');

      expect(secondAuditLedgerEvents).toHaveLength(1);
      expect(secondAuditLedgerEvents[0].orderId).toBe('ord_synthetic_101');
    });

    it('delivers events to global catch-all subscribers alongside specific event subscribers', async () => {
      const eventBusInstance = new EventBus();
      const specificOrderEventsReceived: string[] = [];
      const globalAuditTrailEventsReceived: string[] = [];

      eventBusInstance.subscribe('order.created', (orderEvent: OrderCreatedEvent) => {
        specificOrderEventsReceived.push(orderEvent.orderId);
      });

      eventBusInstance.subscribeToAll((anyDomainEvent) => {
        globalAuditTrailEventsReceived.push(anyDomainEvent.eventName);
      });

      const syntheticOrderEvent = createSyntheticOrderCreatedEvent(202);
      await eventBusInstance.publish(syntheticOrderEvent, createDeliveryContext('delivery_test_202'));

      expect(specificOrderEventsReceived).toEqual(['ord_synthetic_202']);
      expect(globalAuditTrailEventsReceived).toEqual(['order.created']);
    });
  });

  describe('Error Isolation Between Subscribers', () => {
    it('ensures an unhandled error in one subscriber does not prevent other subscribers from executing', async () => {
      const capturedFailureLogger = vi.fn();
      const eventBusInstance = new EventBus(new SubscriberRegistry(), capturedFailureLogger);

      const successfulSubscriberEvents: string[] = [];

      // Faulty subscriber designed to crash
      eventBusInstance.subscribe('order.created', () => {
        throw new Error('Database connection dropped in kitchen printer subscriber!');
      });

      // Healthy subscriber that must still execute
      eventBusInstance.subscribe('order.created', (orderEvent: OrderCreatedEvent) => {
        successfulSubscriberEvents.push(orderEvent.orderId);
      });

      const syntheticOrderEvent = createSyntheticOrderCreatedEvent(303);
      await eventBusInstance.publish(syntheticOrderEvent, createDeliveryContext('delivery_test_303'));

      // The healthy subscriber succeeded despite the sibling subscriber throwing an exception
      expect(successfulSubscriberEvents).toEqual(['ord_synthetic_303']);
      expect(capturedFailureLogger).toHaveBeenCalledTimes(1);
    });
  });

  describe('Integration with AggregateRoot Domain Events', () => {
    class MockOrderAggregateRoot extends AggregateRoot<OrderId> {
      private constructor(aggregateIdentifier: OrderId) {
        super(aggregateIdentifier);
      }

      public static createNewOrder = (orderIdentifierValue: string): MockOrderAggregateRoot => {
        const validatedOrderId = createOrderId(orderIdentifierValue);
        const newOrderAggregateInstance = new MockOrderAggregateRoot(validatedOrderId);

        const syntheticDomainEvent: DomainEvent = {
          eventId: 'evt_domain_777',
          occurredOn: new Date(),
          eventName: 'order.created',
        };

        newOrderAggregateInstance.addDomainEvent(syntheticDomainEvent);
        return newOrderAggregateInstance;
      };
    }

    it('extracts staged domain events from aggregate root and clears them after publishing', async () => {
      const eventBusInstance = new EventBus();
      const deliveredEventsFromAggregate: string[] = [];

      eventBusInstance.subscribeToAll((receivedEvent) => {
        deliveredEventsFromAggregate.push(receivedEvent.eventName);
      });

      const orderAggregateInstance = MockOrderAggregateRoot.createNewOrder('ord_agg_555');
      const stagedEventsBeforeClear = orderAggregateInstance.domainEvents;

      expect(stagedEventsBeforeClear).toHaveLength(1);

      // Publish staged events through the event bus
      for (const currentStagedEvent of stagedEventsBeforeClear) {
        await eventBusInstance.publish(
          currentStagedEvent as unknown as OrderCreatedEvent,
          createDeliveryContext('delivery_agg_555')
        );
      }

      // Flush internal aggregate event queue
      orderAggregateInstance.clearDomainEvents();

      expect(deliveredEventsFromAggregate).toEqual(['order.created']);
      expect(orderAggregateInstance.domainEvents).toHaveLength(0);
    });
  });

  describe('High-Volume Stress Test', () => {
    it('dispatches and processes 1,000 synthetic events without message loss', async () => {
      const eventBusInstance = new EventBus();
      let totalEventsSuccessfullyReceivedCount = 0;

      eventBusInstance.subscribe('order.created', () => {
        totalEventsSuccessfullyReceivedCount += 1;
      });

      const totalStressEventCount = 1000;
      const batchPublishPromises: Promise<void>[] = [];

      for (let eventIndex = 1; eventIndex <= totalStressEventCount; eventIndex += 1) {
        const syntheticStressEvent = createSyntheticOrderCreatedEvent(eventIndex);
        const deliveryContext = createDeliveryContext(`delivery_stress_${eventIndex}`);
        batchPublishPromises.push(eventBusInstance.publish(syntheticStressEvent, deliveryContext));
      }

      await Promise.all(batchPublishPromises);

      expect(totalEventsSuccessfullyReceivedCount).toBe(totalStressEventCount);
    });
  });

  describe('InMemoryOutboxRepository', () => {
    it('records, queries unpublished events, and marks records as published', async () => {
      const inMemoryOutboxRepository = new InMemoryOutboxRepository();
      const syntheticOrderEvent = createSyntheticOrderCreatedEvent(404);

      await inMemoryOutboxRepository.save(syntheticOrderEvent);

      expect(inMemoryOutboxRepository.recordedEventCount).toBe(1);

      const unpublishedRecordsInitialBatch = await inMemoryOutboxRepository.fetchUnpublished(10);
      expect(unpublishedRecordsInitialBatch).toHaveLength(1);
      expect(unpublishedRecordsInitialBatch[0].eventName).toBe('order.created');
      expect(unpublishedRecordsInitialBatch[0].publishedAt).toBeNull();

      const recordIdentifierToMark = unpublishedRecordsInitialBatch[0].id!;
      await inMemoryOutboxRepository.markAsPublished(recordIdentifierToMark);

      const unpublishedRecordsAfterPublish = await inMemoryOutboxRepository.fetchUnpublished(10);
      expect(unpublishedRecordsAfterPublish).toHaveLength(0);

      inMemoryOutboxRepository.clearRecordedEvents();
      expect(inMemoryOutboxRepository.recordedEventCount).toBe(0);
    });
  });
});
