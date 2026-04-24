import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

export const createDbClient = (databaseUrl: string) => {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
};

export type DbClient = ReturnType<typeof createDbClient>;

// Reusable script client (for Node/tsx scripts). In Workers runtime this stays null.
const databaseUrlFromEnv = typeof process !== 'undefined' ? process.env?.DATABASE_URL : undefined;
export const db: DbClient | null = databaseUrlFromEnv
  ? createDbClient(databaseUrlFromEnv)
  : null;
