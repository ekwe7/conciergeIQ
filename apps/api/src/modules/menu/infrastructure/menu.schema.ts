import { boolean, integer, pgSchema, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const menuSchema = pgSchema('menu');

export const categories = menuSchema.table('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  hotelId: uuid('hotel_id').notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const items = menuSchema.table('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  hotelId: uuid('hotel_id').notNull(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  priceMinor: integer('price_minor').notNull(),
  photoUrl: varchar('photo_url', { length: 255 }),
  isAvailable: boolean('is_available').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CategoryRow = typeof categories.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
export type NewItemRow = typeof items.$inferInsert;
