import { index, jsonb, pgSchema, smallint, timestamp, unique, uuid, varchar, integer, text } from 'drizzle-orm/pg-core';
import type { EscalationAlertStatus, EscalationChannel, EscalationStep } from '@conciergeiq/contracts';

export const escalationsSchema = pgSchema('escalations');

/** One row per hotel: who is texted after how long. */
export const rules = escalationsSchema.table('rules', {
  hotelId: uuid('hotel_id').primaryKey(),
  manager: jsonb('manager').$type<EscalationStep>().notNull(),
  admin: jsonb('admin').$type<EscalationStep>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  updatedByUserId: uuid('updated_by_user_id'),
});

/**
 * Every alert sent, or attempted. The unique (order, level) row is claimed
 * before sending, so two API instances never text twice for the same order.
 */
export const alerts = escalationsSchema.table(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hotelId: uuid('hotel_id').notNull(),
    orderId: uuid('order_id').notNull(),
    orderNumber: integer('order_number').notNull(),
    roomNumber: varchar('room_number', { length: 10 }).notNull(),
    level: smallint('level').notNull(),
    channel: varchar('channel', { length: 10 }).$type<EscalationChannel>().notNull(),
    recipientName: varchar('recipient_name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    status: varchar('status', { length: 10 }).$type<EscalationAlertStatus>().notNull(),
    providerMessageId: varchar('provider_message_id', { length: 64 }),
    error: text('error'),
    waitedSeconds: integer('waited_seconds').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('alerts_order_level_unique').on(table.orderId, table.level),
    index('alerts_hotel_sent_at_idx').on(table.hotelId, table.sentAt),
  ],
);

export type RulesRow = typeof rules.$inferSelect;
export type AlertRow = typeof alerts.$inferSelect;
