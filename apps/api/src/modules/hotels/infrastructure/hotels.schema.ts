import { char, pgSchema, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const hotelsSchema = pgSchema('hotels');

export const hotels = hotelsSchema.table('hotels', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  address: varchar('address', { length: 255 }).notNull().default(''),
  timezone: varchar('timezone', { length: 50 }).notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type HotelRow = typeof hotels.$inferSelect;
