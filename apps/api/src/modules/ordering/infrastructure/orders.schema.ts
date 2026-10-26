import { index, integer, pgSchema, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import type { OrderStatus, PaymentMethod } from '@conciergeiq/contracts';

export const orderingSchema = pgSchema('ordering');

/** Order numbers run across all hotels: A-1001, A-1002, ... */
export const orderNumberSequence = orderingSchema.sequence('order_number_seq', { startWith: 1001 });

export const orders = orderingSchema.table(
  'orders',
  {
    id: uuid('id').primaryKey(),
    hotelId: uuid('hotel_id').notNull(),
    number: integer('number').notNull().unique(),
    roomId: uuid('room_id').notNull(),
    roomNumber: varchar('room_number', { length: 10 }).notNull(),
    stayId: uuid('stay_id').notNull(),
    status: varchar('status', { length: 20 }).$type<OrderStatus>().notNull(),
    totalMinor: integer('total_minor').notNull(),
    cancelReason: varchar('cancel_reason', { length: 255 }),
    idempotencyKey: varchar('idempotency_key', { length: 64 }),
    // Copied from payment.recorded so the board can show "Paid · Card" without asking the payments module.
    paymentMethod: varchar('payment_method', { length: 20 }).$type<PaymentMethod>(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('orders_hotel_idempotency_key_unique').on(table.hotelId, table.idempotencyKey),
    index('orders_hotel_created_at_idx').on(table.hotelId, table.createdAt),
    index('orders_stay_idx').on(table.stayId),
  ],
);

export const orderItems = orderingSchema.table('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  position: integer('position').notNull(),
  itemId: uuid('item_id').notNull(),
  itemName: varchar('item_name', { length: 120 }).notNull(),
  unitPriceMinor: integer('unit_price_minor').notNull(),
  quantity: integer('quantity').notNull(),
  note: varchar('note', { length: 255 }),
});

export const orderStatusLog = orderingSchema.table('order_status_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  fromStatus: varchar('from_status', { length: 20 }).$type<OrderStatus>(),
  toStatus: varchar('to_status', { length: 20 }).$type<OrderStatus>().notNull(),
  changedByUserId: uuid('changed_by_user_id'),
  changedByName: varchar('changed_by_name', { length: 120 }).notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull(),
});

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type OrderStatusLogRow = typeof orderStatusLog.$inferSelect;
