import type { Order, StatusChange } from '../../domain/order.aggregate.js';

/** Who moved an order to a new status, as shown on its timeline. */
export interface StatusChanger {
  userId: string | null;
  name: string;
}

/** Saves and loads orders for the write side. Every lookup is scoped to one hotel. */
export interface OrderRepository {
  nextOrderNumber(): Promise<number>;
  findById(hotelId: string, orderId: string): Promise<Order | undefined>;
  findByIdempotencyKey(hotelId: string, idempotencyKey: string): Promise<Order | undefined>;
  insert(order: Order, placedBy: StatusChanger): Promise<void>;
  saveStatusChange(order: Order, change: StatusChange, changedBy: StatusChanger): Promise<void>;
}
