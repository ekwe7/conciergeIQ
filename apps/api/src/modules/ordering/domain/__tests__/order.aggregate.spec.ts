/**
 * WHAT IT DOES:
 * Comprehensive unit test suite for the `Order` aggregate root and state machine pattern.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Tests all valid and invalid state transitions across PendingState, InProgressState,
 *   DeliveredState, and CancelledState.
 * - Verifies domain event emission (`OrderCreatedEvent` and `OrderStatusChangedEvent`)
 *   including actor context and monetary unit conversions.
 * - Enforces item immutability invariants: items can only be updated in PENDING status,
 *   and `order.items` returns a deeply frozen or immutable snapshot.
 * - Tests terminal state invariants (DELIVERED and CANCELLED cannot transition or be modified).
 */

import { describe, expect, it } from 'vitest';
import type { EventActor, OrderCreatedEvent, OrderStatusChangedEvent } from '@conciergeiq/contracts';
import {
  EmptyOrderError,
  InvalidStateTransitionError,
  TerminalStateError,
} from '../errors.js';
import { Order, type OrderProps } from '../order.aggregate.js';
import type { OrderItem } from '../order-item.js';
import { OrderStatus } from '../order-status.js';

describe('Order Aggregate Root & State Machine', () => {
  const initialTimestamp = new Date('2026-10-29T10:00:00.000Z');
  const acceptedTimestamp = new Date('2026-10-29T10:05:00.000Z');
  const deliveredTimestamp = new Date('2026-10-29T10:20:00.000Z');
  const cancelledTimestamp = new Date('2026-10-29T10:15:00.000Z');

  const sampleItems: OrderItem[] = [
    {
      itemId: 'item-burger',
      name: 'Gourmet Wagyu Burger',
      unitPriceMinor: 2500, // 25.00
      quantity: 2,
      notes: 'Medium rare',
    },
    {
      itemId: 'item-fries',
      name: 'Truffle Fries',
      unitPriceMinor: 800, // 8.00
      quantity: 1,
    },
  ];

  const createPendingOrder = (customItems = sampleItems, customActor?: EventActor): Order => {
    return Order.place({
      id: 'order-101',
      hotelId: 'hotel-grand',
      number: 1042,
      roomId: 'room-501',
      roomNumber: '501',
      stayId: 'stay-789',
      items: customItems,
      idempotencyKey: 'idem-key-123',
      createdAt: initialTimestamp,
      actor: customActor,
    });
  };

  describe('Order Placement & Initialization', () => {
    it('initializes aggregate with PENDING status and calculates monetary totals', () => {
      const order = createPendingOrder();

      expect(order.id).toBe('order-101');
      expect(order.hotelId).toBe('hotel-grand');
      expect(order.number).toBe(1042);
      expect(order.roomId).toBe('room-501');
      expect(order.roomNumber).toBe('501');
      expect(order.stayId).toBe('stay-789');
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.cancelReason).toBeNull();
      expect(order.idempotencyKey).toBe('idem-key-123');
      expect(order.createdAt).toEqual(initialTimestamp);
      expect(order.updatedAt).toEqual(initialTimestamp);

      // Total minor: (2500 * 2) + (800 * 1) = 5800 minor units ($58.00)
      expect(order.totalMinor).toBe(5800);
      expect(order.totalAmount).toBe(58.00);
      expect(order.items).toHaveLength(2);
    });

    it('emits OrderCreatedEvent upon successful placement with guest actor default', () => {
      const order = createPendingOrder();
      const domainEvents = order.pullDomainEvents();

      expect(domainEvents).toHaveLength(1);
      const createdEvent = domainEvents[0] as unknown as OrderCreatedEvent;

      expect(createdEvent.eventName).toBe('order.created');
      expect(createdEvent.hotelId).toBe('hotel-grand');
      expect(createdEvent.orderId).toBe('order-101');
      expect(createdEvent.orderNumber).toBe(1042);
      expect(createdEvent.roomId).toBe('room-501');
      expect(createdEvent.roomNumber).toBe('501');
      expect(createdEvent.status).toBe(OrderStatus.PENDING);
      expect(createdEvent.occurredAt).toBe(initialTimestamp.toISOString());
      expect(createdEvent.totalAmount).toBe(58.00);
      expect(createdEvent.actor).toEqual({
        type: 'guest',
        roomNumber: '501',
      });
      expect(createdEvent.items).toEqual([
        {
          itemId: 'item-burger',
          name: 'Gourmet Wagyu Burger',
          quantity: 2,
          unitPrice: 25.00,
          notes: 'Medium rare',
        },
        {
          itemId: 'item-fries',
          name: 'Truffle Fries',
          quantity: 1,
          unitPrice: 8.00,
          notes: undefined,
        },
      ]);
    });

    it('emits OrderCreatedEvent with explicit actor when provided', () => {
      const staffActor: EventActor = {
        type: 'staff',
        id: 'staff-42',
        name: 'Concierge Staff',
      };
      const order = createPendingOrder(sampleItems, staffActor);
      const domainEvents = order.pullDomainEvents();

      expect(domainEvents).toHaveLength(1);
      const createdEvent = domainEvents[0] as unknown as OrderCreatedEvent;
      expect(createdEvent.actor).toEqual(staffActor);
    });

    it('pullDomainEvents drains the recorded domain events buffer', () => {
      const order = createPendingOrder();
      expect(order.pullDomainEvents()).toHaveLength(1);
      expect(order.pullDomainEvents()).toHaveLength(0);
    });

    it('throws EmptyOrderError when placing an order with zero items', () => {
      expect(() => {
        Order.place({
          id: 'order-102',
          hotelId: 'hotel-grand',
          number: 1043,
          roomId: 'room-501',
          roomNumber: '501',
          stayId: 'stay-789',
          items: [],
          idempotencyKey: null,
          createdAt: initialTimestamp,
        });
      }).toThrow(EmptyOrderError);
    });

    it('restores existing order aggregate from persistent state without emitting events', () => {
      const persistedProps: OrderProps = {
        id: 'order-persisted',
        hotelId: 'hotel-grand',
        number: 1050,
        roomId: 'room-502',
        roomNumber: '502',
        stayId: 'stay-999',
        items: sampleItems,
        status: OrderStatus.IN_PROGRESS,
        cancelReason: null,
        idempotencyKey: 'idem-existing',
        createdAt: initialTimestamp,
        updatedAt: acceptedTimestamp,
      };

      const restoredOrder = Order.restore(persistedProps);
      expect(restoredOrder.id).toBe('order-persisted');
      expect(restoredOrder.status).toBe(OrderStatus.IN_PROGRESS);
      expect(restoredOrder.updatedAt).toEqual(acceptedTimestamp);
      expect(restoredOrder.pullDomainEvents()).toHaveLength(0);
    });
  });

  describe('Valid State Transitions', () => {
    it('transitions PENDING -> IN_PROGRESS via accept() and records OrderStatusChangedEvent', () => {
      const order = createPendingOrder();
      order.pullDomainEvents(); // Clear creation event

      const staffActor: EventActor = {
        type: 'staff',
        id: 'kitchen-chef-1',
        name: 'Head Chef',
      };

      const transitionResult = order.accept(acceptedTimestamp, staffActor);

      expect(transitionResult).toEqual({
        from: OrderStatus.PENDING,
        to: OrderStatus.IN_PROGRESS,
      });
      expect(order.status).toBe(OrderStatus.IN_PROGRESS);
      expect(order.updatedAt).toEqual(acceptedTimestamp);

      const events = order.pullDomainEvents();
      expect(events).toHaveLength(1);
      const statusChangedEvent = events[0] as unknown as OrderStatusChangedEvent;
      expect(statusChangedEvent.eventName).toBe('order.status_changed');
      expect(statusChangedEvent.orderId).toBe('order-101');
      expect(statusChangedEvent.previousStatus).toBe(OrderStatus.PENDING);
      expect(statusChangedEvent.newStatus).toBe(OrderStatus.IN_PROGRESS);
      expect(statusChangedEvent.occurredAt).toBe(acceptedTimestamp.toISOString());
      expect(statusChangedEvent.actor).toEqual(staffActor);
    });

    it('transitions IN_PROGRESS -> DELIVERED via deliver() and records OrderStatusChangedEvent', () => {
      const order = createPendingOrder();
      order.accept(acceptedTimestamp);
      order.pullDomainEvents(); // Clear previous events

      const runnerActor: EventActor = {
        type: 'staff',
        id: 'runner-07',
        name: 'Order Runner',
      };

      const transitionResult = order.deliver(deliveredTimestamp, runnerActor);

      expect(transitionResult).toEqual({
        from: OrderStatus.IN_PROGRESS,
        to: OrderStatus.DELIVERED,
      });
      expect(order.status).toBe(OrderStatus.DELIVERED);
      expect(order.updatedAt).toEqual(deliveredTimestamp);

      const events = order.pullDomainEvents();
      expect(events).toHaveLength(1);
      const statusChangedEvent = events[0] as unknown as OrderStatusChangedEvent;
      expect(statusChangedEvent.eventName).toBe('order.status_changed');
      expect(statusChangedEvent.previousStatus).toBe(OrderStatus.IN_PROGRESS);
      expect(statusChangedEvent.newStatus).toBe(OrderStatus.DELIVERED);
      expect(statusChangedEvent.actor).toEqual(runnerActor);
    });

    it('transitions PENDING -> CANCELLED via cancel() with reason and records event', () => {
      const order = createPendingOrder();
      order.pullDomainEvents();

      const guestActor: EventActor = {
        type: 'guest',
        roomNumber: '501',
      };

      const transitionResult = order.cancel('Guest decided to dine out', cancelledTimestamp, guestActor);

      expect(transitionResult).toEqual({
        from: OrderStatus.PENDING,
        to: OrderStatus.CANCELLED,
      });
      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(order.cancelReason).toBe('Guest decided to dine out');
      expect(order.updatedAt).toEqual(cancelledTimestamp);

      const events = order.pullDomainEvents();
      expect(events).toHaveLength(1);
      const statusChangedEvent = events[0] as unknown as OrderStatusChangedEvent;
      expect(statusChangedEvent.eventName).toBe('order.status_changed');
      expect(statusChangedEvent.previousStatus).toBe(OrderStatus.PENDING);
      expect(statusChangedEvent.newStatus).toBe(OrderStatus.CANCELLED);
      expect(statusChangedEvent.reason).toBe('Guest decided to dine out');
      expect(statusChangedEvent.actor).toEqual(guestActor);
    });

    it('transitions IN_PROGRESS -> CANCELLED via cancel() with reason', () => {
      const order = createPendingOrder();
      order.accept(acceptedTimestamp);
      order.pullDomainEvents();

      const transitionResult = order.cancel('Kitchen ran out of beef', cancelledTimestamp);

      expect(transitionResult).toEqual({
        from: OrderStatus.IN_PROGRESS,
        to: OrderStatus.CANCELLED,
      });
      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(order.cancelReason).toBe('Kitchen ran out of beef');

      const events = order.pullDomainEvents();
      expect(events).toHaveLength(1);
      const statusChangedEvent = events[0] as unknown as OrderStatusChangedEvent;
      expect(statusChangedEvent.previousStatus).toBe(OrderStatus.IN_PROGRESS);
      expect(statusChangedEvent.newStatus).toBe(OrderStatus.CANCELLED);
      expect(statusChangedEvent.reason).toBe('Kitchen ran out of beef');
      expect(statusChangedEvent.actor).toEqual({ type: 'system' });
    });

    it('advances sequentially through the lifecycle via advance()', () => {
      const order = createPendingOrder();

      const firstAdvance = order.advance(acceptedTimestamp);
      expect(firstAdvance).toEqual({
        from: OrderStatus.PENDING,
        to: OrderStatus.IN_PROGRESS,
      });
      expect(order.status).toBe(OrderStatus.IN_PROGRESS);

      const secondAdvance = order.advance(deliveredTimestamp);
      expect(secondAdvance).toEqual({
        from: OrderStatus.IN_PROGRESS,
        to: OrderStatus.DELIVERED,
      });
      expect(order.status).toBe(OrderStatus.DELIVERED);
    });
  });

  describe('Invalid State Transitions & State Machine Matrix', () => {
    it('throws InvalidStateTransitionError when attempting PENDING -> DELIVERED directly', () => {
      const order = createPendingOrder();

      expect(() => {
        order.deliver(deliveredTimestamp);
      }).toThrow(InvalidStateTransitionError);

      expect(order.status).toBe(OrderStatus.PENDING);
    });

    it('throws InvalidStateTransitionError when attempting IN_PROGRESS -> IN_PROGRESS via accept()', () => {
      const order = createPendingOrder();
      order.accept(acceptedTimestamp);

      expect(() => {
        order.accept(acceptedTimestamp);
      }).toThrow(InvalidStateTransitionError);

      expect(order.status).toBe(OrderStatus.IN_PROGRESS);
    });

    it('throws TerminalStateError when attempting any transition from DELIVERED', () => {
      const order = createPendingOrder();
      order.accept(acceptedTimestamp);
      order.deliver(deliveredTimestamp);

      expect(order.status).toBe(OrderStatus.DELIVERED);

      expect(() => order.accept(deliveredTimestamp)).toThrow(TerminalStateError);
      expect(() => order.deliver(deliveredTimestamp)).toThrow(TerminalStateError);
      expect(() => order.cancel('Too late', deliveredTimestamp)).toThrow(TerminalStateError);
      expect(() => order.advance(deliveredTimestamp)).toThrow(TerminalStateError);
    });

    it('throws TerminalStateError when attempting any transition from CANCELLED', () => {
      const order = createPendingOrder();
      order.cancel('Guest cancelled', cancelledTimestamp);

      expect(order.status).toBe(OrderStatus.CANCELLED);

      expect(() => order.accept(cancelledTimestamp)).toThrow(TerminalStateError);
      expect(() => order.deliver(cancelledTimestamp)).toThrow(TerminalStateError);
      expect(() => order.cancel('Cancel again', cancelledTimestamp)).toThrow(TerminalStateError);
      expect(() => order.advance(cancelledTimestamp)).toThrow(TerminalStateError);
    });
  });

  describe('Item Immutability Invariant', () => {
    it('allows updating items when order is in PENDING status', () => {
      const order = createPendingOrder();

      const newItems: OrderItem[] = [
        {
          itemId: 'item-salad',
          name: 'Caesar Salad',
          unitPriceMinor: 1200,
          quantity: 1,
        },
      ];

      order.updateItems(newItems);

      expect(order.items).toHaveLength(1);
      expect(order.items[0]?.itemId).toBe('item-salad');
      expect(order.totalMinor).toBe(1200);
      expect(order.totalAmount).toBe(12.00);
    });

    it('throws EmptyOrderError when updating items to empty array in PENDING status', () => {
      const order = createPendingOrder();

      expect(() => {
        order.updateItems([]);
      }).toThrow(EmptyOrderError);
    });

    it('throws InvalidStateTransitionError when updating items in IN_PROGRESS status', () => {
      const order = createPendingOrder();
      order.accept(acceptedTimestamp);

      expect(() => {
        order.updateItems([
          {
            itemId: 'item-dessert',
            name: 'Cheesecake',
            unitPriceMinor: 700,
            quantity: 1,
          },
        ]);
      }).toThrow(InvalidStateTransitionError);
    });

    it('throws InvalidStateTransitionError when updating items in DELIVERED status', () => {
      const order = createPendingOrder();
      order.accept(acceptedTimestamp);
      order.deliver(deliveredTimestamp);

      expect(() => {
        order.updateItems([
          {
            itemId: 'item-dessert',
            name: 'Cheesecake',
            unitPriceMinor: 700,
            quantity: 1,
          },
        ]);
      }).toThrow(InvalidStateTransitionError);
    });

    it('throws InvalidStateTransitionError when updating items in CANCELLED status', () => {
      const order = createPendingOrder();
      order.cancel('User changed mind', cancelledTimestamp);

      expect(() => {
        order.updateItems([
          {
            itemId: 'item-dessert',
            name: 'Cheesecake',
            unitPriceMinor: 700,
            quantity: 1,
          },
        ]);
      }).toThrow(InvalidStateTransitionError);
    });

    it('returns a frozen items array preventing direct mutation', () => {
      const order = createPendingOrder();
      const itemsSnapshot = order.items;

      expect(Object.isFrozen(itemsSnapshot)).toBe(true);
      expect(() => {
        // @ts-expect-error - testing runtime immutability on frozen array
        itemsSnapshot.push({
          itemId: 'item-hack',
          name: 'Hacked Item',
          unitPriceMinor: 0,
          quantity: 1,
        });
      }).toThrow();
    });
  });

  describe('Serialization toProps()', () => {
    it('serializes all aggregate state accurately', () => {
      const order = createPendingOrder();
      order.accept(acceptedTimestamp);

      const serialized = order.toProps();

      expect(serialized).toEqual({
        id: 'order-101',
        hotelId: 'hotel-grand',
        number: 1042,
        roomId: 'room-501',
        roomNumber: '501',
        stayId: 'stay-789',
        items: sampleItems,
        status: OrderStatus.IN_PROGRESS,
        cancelReason: null,
        idempotencyKey: 'idem-key-123',
        createdAt: initialTimestamp,
        updatedAt: acceptedTimestamp,
      });
    });
  });
});
