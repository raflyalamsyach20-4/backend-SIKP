import * as dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: '.env' });

const args = process.argv.slice(2);
const applyArg = args.includes('--apply');
const APPLY = applyArg || process.env.APPLY === 'true';

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  if (!APPLY) {
    console.log('[DB Reset] Dry run mode. No changes applied.');
    console.log('[DB Reset] Re-run with --apply or APPLY=true to execute.');
    process.exit(0);
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log('[DB Reset] Dropping schemas: public, drizzle');
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;

  console.log('[DB Reset] Recreating public schema');
  await sql`CREATE SCHEMA public`;
  await sql`GRANT ALL ON SCHEMA public TO public`;
  await sql`GRANT ALL ON SCHEMA public TO CURRENT_USER`;

  console.log('[DB Reset] Done. Run migrations with: bun run db:migrate');
};

run().catch((error) => {
  console.error('[DB Reset] Failed:', error);
  process.exit(1);
});
