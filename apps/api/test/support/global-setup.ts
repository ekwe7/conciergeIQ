import 'dotenv/config';
import { runMigrations } from '../../src/shared/db/migrate.js';

/** Brings the test database up to the latest migration before any test runs. */
export default async function setup(): Promise<void> {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ?? 'postgresql://concierge:concierge_secret@localhost:5432/concierge_iq_test';
  await runMigrations(databaseUrl);
}
