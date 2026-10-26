import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { connectToDatabase } from './client.js';

/** apps/api/db/migrations, from both src/shared/db and dist/shared/db. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../db/migrations', import.meta.url));

/** Applies pending migrations to the database at `databaseUrl`. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const { db, close } = connectToDatabase(databaseUrl);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { env } = await import('../../config/index.js');
  await runMigrations(env.DATABASE_URL);
  console.log('Migrations applied');
}
