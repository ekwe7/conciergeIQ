import { boolean, integer, pgSchema, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

export const roomsSchema = pgSchema('rooms');

export const rooms = roomsSchema.table(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hotelId: uuid('hotel_id').notNull(),
    number: varchar('number', { length: 10 }).notNull(),
    floor: integer('floor').notNull(),
    qrToken: varchar('qr_token', { length: 64 }).notNull().unique(),
    qrRegeneratedAt: timestamp('qr_regenerated_at', { withTimezone: true }),
    isOutOfOrder: boolean('is_out_of_order').notNull().default(false),
    outOfOrderReason: varchar('out_of_order_reason', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('rooms_hotel_number_unique').on(table.hotelId, table.number)],
);

export type RoomRow = typeof rooms.$inferSelect;
export type NewRoomRow = typeof rooms.$inferInsert;
