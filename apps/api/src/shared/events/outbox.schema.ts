import { bigserial, index, jsonb, pgSchema, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { DomainEvent } from '@conciergeiq/contracts';

export const platformSchema = pgSchema('platform');

export const outboxEvents = platformSchema.table(
  'outbox_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventName: varchar('event_name', { length: 64 }).notNull(),
    hotelId: uuid('hotel_id').notNull(),
    payload: jsonb('payload').$type<DomainEvent>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [index('outbox_events_unpublished_idx').on(table.id).where(sql`published_at is null`)],
);
