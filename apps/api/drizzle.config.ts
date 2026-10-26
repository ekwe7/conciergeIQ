import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  // Each module owns its tables in its own Postgres schema.
  schema: ['./src/shared/events/outbox.schema.ts', './src/modules/*/infrastructure/*.schema.ts'],
  out: './db/migrations',
  schemaFilter: ['platform', 'hotels', 'identity', 'rooms', 'stays', 'menu', 'ordering', 'payments', 'audit'],
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
