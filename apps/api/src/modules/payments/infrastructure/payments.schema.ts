import { index, integer, pgSchema, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { PaymentMethod } from '@conciergeiq/contracts';

export const paymentsSchema = pgSchema('payments');

export const payments = paymentsSchema.table(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hotelId: uuid('hotel_id').notNull(),
    // One payment per order: unique, so a double tap cannot record it twice.
    orderId: uuid('order_id').notNull().unique(),
    orderNumber: integer('order_number').notNull(),
    roomNumber: varchar('room_number', { length: 10 }).notNull(),
    amountMinor: integer('amount_minor').notNull(),
    method: varchar('method', { length: 20 }).$type<PaymentMethod>().notNull(),
    reference: varchar('reference', { length: 64 }),
    recordedByUserId: uuid('recorded_by_user_id').notNull(),
    recordedByName: varchar('recorded_by_name', { length: 120 }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('payments_hotel_recorded_at_idx').on(table.hotelId, table.recordedAt)],
);

export type PaymentRow = typeof payments.$inferSelect;
export type NewPaymentRow = typeof payments.$inferInsert;
