import type { CategoryTranslations, ItemTranslations } from '@conciergeiq/contracts';
import { boolean, integer, jsonb, pgSchema, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const menuSchema = pgSchema('menu');

export const categories = menuSchema.table('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  hotelId: uuid('hotel_id').notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  // Service hours in the hotel's time zone ("06:30"); null means all day.
  availableFrom: varchar('available_from', { length: 5 }),
  availableUntil: varchar('available_until', { length: 5 }),
  translations: jsonb('translations').$type<CategoryTranslations>().notNull().default({}),
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
  isFeatured: boolean('is_featured').notNull().default(false),
  pairsWith: jsonb('pairs_with').$type<string[]>().notNull().default([]),
  translations: jsonb('translations').$type<ItemTranslations>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CategoryRow = typeof categories.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
export type NewItemRow = typeof items.$inferInsert;
