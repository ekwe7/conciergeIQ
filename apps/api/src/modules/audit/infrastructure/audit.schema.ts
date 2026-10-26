import { index, pgSchema, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ActivityCategory } from '@conciergeiq/contracts';

export const auditSchema = pgSchema('audit');

/** Append-only. Nothing updates or deletes rows here. */
export const activityLog = auditSchema.table(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The outbox event id. Unique, so delivering an event twice logs it once.
    eventId: varchar('event_id', { length: 32 }).notNull().unique(),
    hotelId: uuid('hotel_id').notNull(),
    eventName: varchar('event_name', { length: 64 }).notNull(),
    category: varchar('category', { length: 20 }).$type<ActivityCategory>().notNull(),
    detail: varchar('detail', { length: 255 }).notNull(),
    actorId: uuid('actor_id'),
    actorName: varchar('actor_name', { length: 120 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('activity_log_hotel_occurred_at_idx').on(table.hotelId, table.occurredAt)],
);

export type ActivityLogRow = typeof activityLog.$inferSelect;
export type NewActivityLogRow = typeof activityLog.$inferInsert;
