import { describe, expect, it } from 'vitest';
import { Order } from '../domain/order.aggregate.js';

const placedAt = new Date('2026-10-24T19:38:00Z');
const later = new Date('2026-10-24T19:42:00Z');

function placeOrder(items = [{ itemId: 'jollof', name: 'Jollof rice', unitPriceMinor: 850_000, quantity: 1 }]) {
  return Order.place({
    id: 'order-1',
    hotelId: 'hotel-1',
    number: 1042,
    roomId: 'room-101',
    roomNumber: '101',
    stayId: 'stay-1',
    items,
    idempotencyKey: null,
    createdAt: placedAt,
  });
}

describe('Order', () => {
  it('starts as pending', () => {
    expect(placeOrder().status).toBe('PENDING');
  });

  it('adds up its lines', () => {
    const order = placeOrder([
      { itemId: 'jollof', name: 'Jollof rice', unitPriceMinor: 850_000, quantity: 1 },
      { itemId: 'chapman', name: 'Chapman', unitPriceMinor: 240_000, quantity: 2 },
    ]);

    expect(order.totalMinor).toBe(1_330_000);
  });

  it('needs at least one item', () => {
    expect(() => placeOrder([])).toThrow('An order needs at least one item');
  });

  it('is accepted, then delivered', () => {
    const order = placeOrder();

    expect(order.advance(later)).toEqual({ from: 'PENDING', to: 'IN_PROGRESS' });
    expect(order.advance(later)).toEqual({ from: 'IN_PROGRESS', to: 'DELIVERED' });
  });

  it('can be cancelled while pending or in progress, and keeps the reason', () => {
    const pending = placeOrder();
    const inProgress = placeOrder();
    inProgress.advance(later);

    expect(pending.cancel('Guest changed mind', later)).toEqual({ from: 'PENDING', to: 'CANCELLED' });
    expect(inProgress.cancel('Kitchen closed', later)).toEqual({ from: 'IN_PROGRESS', to: 'CANCELLED' });
    expect(pending.toProps().cancelReason).toBe('Guest changed mind');
  });

  it('cannot move once delivered', () => {
    const order = placeOrder();
    order.advance(later);
    order.advance(later);

    expect(() => order.advance(later)).toThrow('This order has already been delivered');
    expect(() => order.cancel('Too late', later)).toThrow('A delivered order cannot be cancelled');
  });

  it('cannot move once cancelled', () => {
    const order = placeOrder();
    order.cancel('Guest changed mind', later);

    expect(() => order.advance(later)).toThrow('This order was cancelled');
    expect(() => order.cancel('Again', later)).toThrow('This order was already cancelled');
  });

  it('remembers when it last changed', () => {
    const order = placeOrder();

    order.advance(later);

    expect(order.toProps().updatedAt).toEqual(later);
  });
});
