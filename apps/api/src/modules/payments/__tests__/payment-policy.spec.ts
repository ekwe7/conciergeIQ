import { describe, expect, it } from 'vitest';
import { assertOrderCanBePaid, type PayableOrder } from '../domain/payment-policy.js';

const delivered: PayableOrder = { status: 'DELIVERED', totalMinor: 1_100_000, isPaid: false };

describe('When an order can be paid', () => {
  it('accepts a delivered order, or one in progress', () => {
    expect(() => assertOrderCanBePaid(delivered)).not.toThrow();
    expect(() => assertOrderCanBePaid({ ...delivered, status: 'IN_PROGRESS' })).not.toThrow();
  });

  it.each([
    ['already paid', { ...delivered, isPaid: true }, 'This order has already been paid'],
    ['cancelled', { ...delivered, status: 'CANCELLED' }, 'A cancelled order cannot be paid'],
    ['not accepted yet', { ...delivered, status: 'PENDING' }, 'Accept the order before recording a payment'],
    ['free', { ...delivered, totalMinor: 0 }, 'This order has no charge'],
  ] as const)('refuses an order that is %s', (_case, order, message) => {
    expect(() => assertOrderCanBePaid(order)).toThrow(message);
  });
});
