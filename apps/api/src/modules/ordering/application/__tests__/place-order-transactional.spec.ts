/**
 * WHAT IT DOES:
 * Unit and error-injection test suite for `PlaceOrderUseCase` verifying atomic transactional
 * coordination between `OrderRepository` and `OutboxRepository`.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Simulates transactional unit of work semantics (`OrderingUnitOfWork`) with rollback tracking.
 * - Injects simulated database errors (e.g. disk failures, constraint violations) during:
 *   1. Order entity persistence (`orders.save`).
 *   2. Outbox event recording (`recordEvent`).
 * - Asserts that upon any failure, transaction rollback is triggered and NO partial writes
 *   (neither order records nor outbox events) are committed.
 * - Validates authoritative server-side pricing and idempotency deduplication.
 */

import type { DomainEvent } from '@conciergeiq/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../../../../shared/utils/clock.js';
import type { Order } from '../../domain/order.aggregate.js';
import { OrderStatus } from '../../domain/order-status.js';
import type { MenuItemPrice, MenuLookup } from '../ports/menu-lookup.port.js';
import type { OrderRepository } from '../ports/order.repository.js';
import type {
  OrderingTransaction,
  OrderingUnitOfWork,
} from '../ports/ordering-unit-of-work.port.js';
import {
  PlaceOrderUseCase,
  type PlaceOrderCommand,
} from '../place-order.use-case.js';

class MockTransactionalUnitOfWork implements OrderingUnitOfWork {
  public committedOrders: Order[] = [];
  public committedEvents: DomainEvent[] = [];
  public transactionRollbackCount = 0;
  public transactionCommitCount = 0;

  public shouldFailOrderSave = false;
  public shouldFailEventRecord = false;
  public failureError = new Error('Database transaction connection aborted');

  private nextOrderNumberValue = 2001;

  public run = async <T>(
    work: (transactionContext: OrderingTransaction) => Promise<T>
  ): Promise<T> => {
    // Staging buffers simulating transaction boundary
    const stagedOrders: Order[] = [];
    const stagedEvents: DomainEvent[] = [];

    const mockOrdersRepository: OrderRepository = {
      nextOrderNumber: async (): Promise<number> => this.nextOrderNumberValue++,
      findById: async (_hotelId, orderId): Promise<Order | undefined> =>
        [...this.committedOrders, ...stagedOrders].find((o) => o.id === orderId),
      findByIdempotencyKey: async (hotelId, idempotencyKey): Promise<Order | undefined> =>
        [...this.committedOrders, ...stagedOrders].find(
          (o) => o.hotelId === hotelId && o.toProps().idempotencyKey === idempotencyKey
        ),
      save: async (orderToSave: Order): Promise<void> => {
        if (this.shouldFailOrderSave) {
          throw this.failureError;
        }
        stagedOrders.push(orderToSave);
      },
      insert: async (orderToInsert: Order): Promise<void> => {
        if (this.shouldFailOrderSave) {
          throw this.failureError;
        }
        stagedOrders.push(orderToInsert);
      },
      saveStatusChange: async (): Promise<void> => {},
    };

    const mockRecordEvent = async (domainEvent: DomainEvent): Promise<void> => {
      if (this.shouldFailEventRecord) {
        throw this.failureError;
      }
      stagedEvents.push(domainEvent);
    };

    try {
      const operationResult = await work({
        orders: mockOrdersRepository,
        recordEvent: mockRecordEvent,
      });

      // Transaction commit: commit staged changes
      this.committedOrders.push(...stagedOrders);
      this.committedEvents.push(...stagedEvents);
      this.transactionCommitCount++;
      return operationResult;
    } catch (transactionError) {
      // Transaction rollback: discard all staged writes
      this.transactionRollbackCount++;
      throw transactionError;
    }
  };
}

describe('PlaceOrderUseCase Transaction & Outbox Unit Tests', () => {
  let mockUnitOfWork: MockTransactionalUnitOfWork;
  let mockMenuLookup: MenuLookup;
  let mockClock: Clock;
  let placeOrderUseCase: PlaceOrderUseCase;

  const currentFixedDate = new Date('2026-10-29T12:00:00.000Z');

  const availableJollof: MenuItemPrice = {
    id: 'e1000000-0000-0000-0000-000000000001',
    name: 'Jollof Rice Special',
    priceMinor: 4500, // $45.00
    isAvailable: true,
  };
  const availableSuya: MenuItemPrice = {
    id: 'e1000000-0000-0000-0000-000000000002',
    name: 'Beef Suya Platter',
    priceMinor: 2500, // $25.00
    isAvailable: true,
  };
  const unavailableDrink: MenuItemPrice = {
    id: 'e1000000-0000-0000-0000-000000000003',
    name: 'Palm Wine Vintage',
    priceMinor: 1500,
    isAvailable: false,
  };

  const sampleOrderCommand: PlaceOrderCommand = {
    hotelId: 'hotel-aurora',
    roomId: 'room-301',
    roomNumber: '301',
    stayId: 'stay-888',
    items: [
      { itemId: availableJollof.id, quantity: 2, notes: 'Extra spicy' },
      { itemId: availableSuya.id, quantity: 1 },
    ],
    idempotencyKey: 'idem-test-uuid-1',
  };

  beforeEach(() => {
    mockUnitOfWork = new MockTransactionalUnitOfWork();
    mockMenuLookup = {
      findItems: async (_hotelId, itemIds) =>
        [availableJollof, availableSuya, unavailableDrink].filter((item) =>
          itemIds.includes(item.id)
        ),
    };
    mockClock = {
      now: () => currentFixedDate,
    };
    placeOrderUseCase = new PlaceOrderUseCase(mockUnitOfWork, mockMenuLookup, mockClock);
  });

  describe('Happy Path: Atomic Transaction & Outbox Event Staging', () => {
    it('persists the order and stages order.created outbox event atomically', async () => {
      const placedOrder = await placeOrderUseCase.execute(sampleOrderCommand);

      expect(mockUnitOfWork.transactionCommitCount).toBe(1);
      expect(mockUnitOfWork.transactionRollbackCount).toBe(0);

      // Verify order aggregate properties
      expect(placedOrder.id).toBeDefined();
      expect(placedOrder.number).toBe(2001);
      expect(placedOrder.hotelId).toBe('hotel-aurora');
      expect(placedOrder.roomNumber).toBe('301');
      expect(placedOrder.status).toBe(OrderStatus.PENDING);
      expect(placedOrder.createdAt).toEqual(currentFixedDate);

      // Server-side calculated totals: (4500 * 2) + (2500 * 1) = 11500 minor ($115.00)
      expect(placedOrder.totalMinor).toBe(11500);
      expect(placedOrder.totalAmount).toBe(115.00);

      // Verify committed persistence
      expect(mockUnitOfWork.committedOrders).toHaveLength(1);
      expect(mockUnitOfWork.committedOrders[0]?.id).toBe(placedOrder.id);

      // Verify outbox domain event
      expect(mockUnitOfWork.committedEvents).toHaveLength(1);
      const outboxEvent = mockUnitOfWork.committedEvents[0] as unknown as Record<string, unknown>;
      expect(outboxEvent.eventName).toBe('order.created');
      expect(outboxEvent.orderId).toBe(placedOrder.id);
      expect(outboxEvent.orderNumber).toBe(2001);
      expect(outboxEvent.hotelId).toBe('hotel-aurora');
      expect(outboxEvent.roomId).toBe('room-301');
      expect(outboxEvent.roomNumber).toBe('301');
      expect(outboxEvent.totalAmount).toBe(115.00);
      expect(outboxEvent.status).toBe('PENDING');
      expect(outboxEvent.actor).toEqual({ type: 'guest', roomNumber: '301' });
    });

    it('returns existing order on duplicate idempotency key without duplicate event staging', async () => {
      const firstSubmission = await placeOrderUseCase.execute(sampleOrderCommand);
      const secondSubmission = await placeOrderUseCase.execute(sampleOrderCommand);

      expect(secondSubmission.id).toBe(firstSubmission.id);
      expect(mockUnitOfWork.committedOrders).toHaveLength(1);
      expect(mockUnitOfWork.committedEvents).toHaveLength(1);
    });
  });

  describe('Error Injection: Complete Transaction Rollback Verification', () => {
    it('rolls back transaction and discards outbox events when order persistence fails', async () => {
      mockUnitOfWork.shouldFailOrderSave = true;

      await expect(
        placeOrderUseCase.execute(sampleOrderCommand)
      ).rejects.toThrow('Database transaction connection aborted');

      expect(mockUnitOfWork.transactionRollbackCount).toBe(1);
      expect(mockUnitOfWork.transactionCommitCount).toBe(0);
      expect(mockUnitOfWork.committedOrders).toHaveLength(0);
      expect(mockUnitOfWork.committedEvents).toHaveLength(0);
    });

    it('rolls back transaction and discards order when outbox event recording fails', async () => {
      mockUnitOfWork.shouldFailEventRecord = true;

      await expect(
        placeOrderUseCase.execute(sampleOrderCommand)
      ).rejects.toThrow('Database transaction connection aborted');

      expect(mockUnitOfWork.transactionRollbackCount).toBe(1);
      expect(mockUnitOfWork.transactionCommitCount).toBe(0);
      expect(mockUnitOfWork.committedOrders).toHaveLength(0);
      expect(mockUnitOfWork.committedEvents).toHaveLength(0);
    });
  });

  describe('Domain Business Rule Invariants', () => {
    it('rejects order with item marked as unavailable before opening transaction', async () => {
      const commandWithUnavailableItem: PlaceOrderCommand = {
        ...sampleOrderCommand,
        items: [{ itemId: unavailableDrink.id, quantity: 1 }],
      };

      await expect(
        placeOrderUseCase.execute(commandWithUnavailableItem)
      ).rejects.toThrow('Palm Wine Vintage is not available right now');

      expect(mockUnitOfWork.transactionCommitCount).toBe(0);
      expect(mockUnitOfWork.transactionRollbackCount).toBe(0);
      expect(mockUnitOfWork.committedOrders).toHaveLength(0);
      expect(mockUnitOfWork.committedEvents).toHaveLength(0);
    });

    it('rejects order with item not present on hotel menu', async () => {
      const commandWithMissingItem: PlaceOrderCommand = {
        ...sampleOrderCommand,
        items: [{ itemId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
      };

      await expect(
        placeOrderUseCase.execute(commandWithMissingItem)
      ).rejects.toThrow('One of the items is not on the menu');

      expect(mockUnitOfWork.transactionCommitCount).toBe(0);
      expect(mockUnitOfWork.transactionRollbackCount).toBe(0);
    });
  });
});
