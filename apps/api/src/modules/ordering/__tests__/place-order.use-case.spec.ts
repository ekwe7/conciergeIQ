import type { DomainEvent } from '@conciergeiq/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MenuItemPrice, MenuLookup } from '../application/ports/menu-lookup.port.js';
import type { OrderRepository } from '../application/ports/order.repository.js';
import type { OrderingUnitOfWork } from '../application/ports/ordering-unit-of-work.port.js';
import { PlaceOrderUseCase, type PlaceOrderCommand } from '../application/use-cases/place-order.use-case.js';
import type { Order } from '../domain/order.aggregate.js';

/** Keeps orders and events in memory, so the use case runs without a database. */
class InMemoryOrdering implements OrderingUnitOfWork {
  readonly orders: Order[] = [];
  readonly events: DomainEvent[] = [];
  private nextNumber = 1001;

  run<T>(work: Parameters<OrderingUnitOfWork['run']>[0]): Promise<T> {
    const orders: OrderRepository = {
      nextOrderNumber: async () => this.nextNumber++,
      findById: async (hotelId, orderId) => this.orders.find((o) => o.hotelId === hotelId && o.id === orderId),
      findByIdempotencyKey: async (hotelId, key) =>
        this.orders.find((o) => o.hotelId === hotelId && o.toProps().idempotencyKey === key),
      insert: async (order) => void this.orders.push(order),
      saveStatusChange: async () => {},
    };
    return work({ orders, recordEvent: async (event) => void this.events.push(event) }) as Promise<T>;
  }
}

const menu = (...items: MenuItemPrice[]): MenuLookup => ({
  findItems: async (_hotelId, itemIds) => items.filter((item) => itemIds.includes(item.id)),
});

const jollof: MenuItemPrice = { id: 'jollof', name: 'Jollof rice', priceMinor: 850_000, isAvailable: true };
const pasta: MenuItemPrice = { id: 'pasta', name: 'Seafood pasta', priceMinor: 1_100_000, isAvailable: false };
const clock = { now: () => new Date('2026-10-24T19:38:00Z') };

const fromRoom101 = (items: PlaceOrderCommand['items'], idempotencyKey?: string): PlaceOrderCommand => ({
  hotelId: 'hotel-1',
  roomId: 'room-101',
  roomNumber: '101',
  stayId: 'stay-1',
  items,
  idempotencyKey,
});

describe('Placing an order', () => {
  let ordering: InMemoryOrdering;
  let placeOrder: PlaceOrderUseCase;

  beforeEach(() => {
    ordering = new InMemoryOrdering();
    placeOrder = new PlaceOrderUseCase(ordering, menu(jollof, pasta), clock);
  });

  it('prices every line from the menu, never from the guest', async () => {
    const order = await placeOrder.execute(fromRoom101([{ itemId: 'jollof', quantity: 2, notes: 'Less pepper' }]));

    expect(order.items).toEqual([
      { itemId: 'jollof', name: 'Jollof rice', unitPriceMinor: 850_000, quantity: 2, notes: 'Less pepper' },
    ]);
    expect(order.totalMinor).toBe(1_700_000);
  });

  it('tells staff about it with an order.created event', async () => {
    const order = await placeOrder.execute(fromRoom101([{ itemId: 'jollof', quantity: 1 }]));

    expect(ordering.events).toEqual([
      expect.objectContaining({
        eventName: 'order.created',
        orderId: order.id,
        orderNumber: 1001,
        roomNumber: '101',
        totalAmount: 8500,
        actor: { type: 'guest', roomNumber: '101' },
      }),
    ]);
  });

  it('refuses items that are marked unavailable', async () => {
    await expect(placeOrder.execute(fromRoom101([{ itemId: 'pasta', quantity: 1 }]))).rejects.toThrow(
      'Seafood pasta is not available right now',
    );
  });

  it('refuses items that are not on this hotel menu', async () => {
    await expect(placeOrder.execute(fromRoom101([{ itemId: 'unknown', quantity: 1 }]))).rejects.toThrow(
      'One of the items is not on the menu',
    );
  });

  it('creates one order when the same submission arrives twice', async () => {
    const first = await placeOrder.execute(fromRoom101([{ itemId: 'jollof', quantity: 1 }], 'tap-1'));
    const retry = await placeOrder.execute(fromRoom101([{ itemId: 'jollof', quantity: 1 }], 'tap-1'));

    expect(retry.id).toBe(first.id);
    expect(ordering.orders).toHaveLength(1);
    expect(ordering.events).toHaveLength(1);
  });
});
