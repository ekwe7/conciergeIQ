import { boolean, index, pgSchema, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const conciergeSchema = pgSchema('concierge');

/** Hotel-approved information the AI concierge answers from. Written by managers. */
export const articles = conciergeSchema.table(
  'articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hotelId: uuid('hotel_id').notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    body: text('body').notNull(),
    isPublished: boolean('is_published').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    updatedBy: varchar('updated_by', { length: 120 }).notNull(),
  },
  (table) => [index('articles_hotel_idx').on(table.hotelId)],
);

export type ArticleRow = typeof articles.$inferSelect;
