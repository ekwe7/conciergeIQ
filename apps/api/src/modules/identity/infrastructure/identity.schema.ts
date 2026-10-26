import { boolean, pgSchema, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { StaffRole } from '@conciergeiq/contracts';

export const identitySchema = pgSchema('identity');

export const users = identitySchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  hotelId: uuid('hotel_id').notNull(),
  fullName: varchar('full_name', { length: 120 }).notNull(),
  email: varchar('email', { length: 160 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).$type<StaffRole>().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastSignedInAt: timestamp('last_signed_in_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = identitySchema.table('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
