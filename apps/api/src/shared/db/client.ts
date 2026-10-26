import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type Database = PostgresJsDatabase;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything a repository can run queries on: the database itself or an open transaction. */
export type DbExecutor = Database | Transaction;

export interface DatabaseConnection {
  db: Database;
  close(): Promise<void>;
}

export function connectToDatabase(url: string): DatabaseConnection {
  const client = postgres(url, { max: 10, onnotice: () => {} });
  return {
    db: drizzle(client),
    close: () => client.end(),
  };
}
