import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

type MigrationRow = { id: number; hash: string; created_at: string };
type ColumnRow = { column_name: string };
type IndexRow = { indexname: string };
type PgErrorLike = { code?: string };

async function main() {
  if (!db) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  let migrations: MigrationRow[] = [];
  let migrationsTableExists = true;

  try {
    const rows = await db.execute(sql`
      SELECT id, hash, created_at
      FROM __drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 15
    `);
    migrations = rows as unknown as MigrationRow[];
  } catch (error) {
    const pgError = error as PgErrorLike;
    if (pgError.code === '42P01') {
      migrationsTableExists = false;
    } else {
      throw error;
    }
  }

  const columns = (await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='submissions'
    ORDER BY ordinal_position
  `)) as unknown as ColumnRow[];

  const indexes = (await db.execute(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname='public' AND tablename='submissions'
    ORDER BY indexname
  `)) as unknown as IndexRow[];

  console.log('\n=== LATEST DB MIGRATIONS ===');
  if (!migrationsTableExists) {
    console.log('Table __drizzle_migrations tidak ditemukan (kemungkinan DB di-manage via db:push).');
  } else {
    console.table(migrations);
  }

  console.log('\n=== SUBMISSIONS COLUMNS ===');
  console.log(columns.map((row) => row.column_name));

  console.log('\n=== SUBMISSIONS INDEXES ===');
  console.log(indexes.map((row) => row.indexname));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
