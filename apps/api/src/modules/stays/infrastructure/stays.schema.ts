import { sql } from 'drizzle-orm';
import { index, pgSchema, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const staysSchema = pgSchema('stays');

export const stays = staysSchema.table(
  'stays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hotelId: uuid('hotel_id').notNull(),
    roomId: uuid('room_id').notNull(),
    roomNumber: varchar('room_number', { length: 10 }).notNull(),
    guestName: varchar('guest_name', { length: 120 }).notNull(),
    guestPhone: varchar('guest_phone', { length: 30 }),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull(),
    expectedCheckOutAt: timestamp('expected_check_out_at', { withTimezone: true }).notNull(),
    checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
    checkedInByUserId: uuid('checked_in_by_user_id').notNull(),
    checkedOutByUserId: uuid('checked_out_by_user_id'),
  },
  (table) => [
    // A room can have only one guest checked in at a time.
    uniqueIndex('stays_one_active_stay_per_room').on(table.roomId).where(sql`checked_out_at is null`),
    index('stays_hotel_active_idx').on(table.hotelId).where(sql`checked_out_at is null`),
  ],
);

export type StayRow = typeof stays.$inferSelect;
export type NewStayRow = typeof stays.$inferInsert;
