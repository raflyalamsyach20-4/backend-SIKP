import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  let migrations: any[] = [];
  let migrationsTableExists = true;

  try {
    migrations = await sql(
      'SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 15'
    );
  } catch (error: any) {
    if (error?.code === '42P01') {
      migrationsTableExists = false;
    } else {
      throw error;
    }
  }

  const columns = await sql(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='submissions' ORDER BY ordinal_position"
  );

  const indexes = await sql(
    "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='submissions' ORDER BY indexname"
  );

  console.log('\n=== LATEST DB MIGRATIONS ===');
  if (!migrationsTableExists) {
    console.log('Table __drizzle_migrations tidak ditemukan (kemungkinan DB di-manage via db:push).');
  } else {
    console.table(migrations);
  }

  console.log('\n=== SUBMISSIONS COLUMNS ===');
  console.log(columns.map((row: any) => row.column_name));

  console.log('\n=== SUBMISSIONS INDEXES ===');
  console.log(indexes.map((row: any) => row.indexname));
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
