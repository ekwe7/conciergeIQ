import type { Language } from '@conciergeiq/contracts';
import { char, jsonb, pgSchema, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const hotelsSchema = pgSchema('hotels');

export const hotels = hotelsSchema.table('hotels', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  address: varchar('address', { length: 255 }).notNull().default(''),
  timezone: varchar('timezone', { length: 50 }).notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  // Guest page branding.
  brandColor: varchar('brand_color', { length: 7 }).notNull().default('#1B2A3A'),
  accentColor: varchar('accent_color', { length: 7 }).notNull().default('#B8862F'),
  welcomeHeadline: jsonb('welcome_headline').$type<Partial<Record<Language, string>>>().notNull().default({}),
  languages: jsonb('languages').$type<Language[]>().notNull().default(['en']),
  // The logo file, base64. Logos are capped at 256 KB, so they live with the hotel rather than in object storage.
  logoData: text('logo_data'),
  logoContentType: varchar('logo_content_type', { length: 40 }),
  logoUpdatedAt: timestamp('logo_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type HotelRow = typeof hotels.$inferSelect;
