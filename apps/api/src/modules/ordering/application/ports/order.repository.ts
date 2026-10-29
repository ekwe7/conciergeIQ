/**
 * WHAT IT DOES:
 * Defines the write-side repository port for persisting and retrieving `Order` aggregates.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Decouples domain logic and use cases from database drivers (e.g. Drizzle ORM / PostgreSQL).
 * - Exposes `save(order, tx)` for atomic persistence within open transaction contexts.
 * - Supports sequential order number generation via `nextOrderNumber()`.
 * - Enforces multi-tenant isolation by requiring `hotelId` on query lookups.
 * - Supports idempotency deduplication via `findByIdempotencyKey(hotelId, idempotencyKey)`.
 */

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
  insert(order: Order, placedBy?: StatusChanger): Promise<void>;
  save(order: Order, tx?: unknown, placedBy?: StatusChanger): Promise<void>;
  saveStatusChange(order: Order, change: StatusChange, changedBy: StatusChanger): Promise<void>;
}
