import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

async function main() {
  if (!db) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  console.log('Applying reset hotfix SQL...');

  await db.execute(sql`ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "archived_at" timestamp`);
  await db.execute(sql`DROP INDEX IF EXISTS "uq_submission_per_team"`);

  console.log('Hotfix applied successfully.');
}

main().catch((err) => {
  console.error('Hotfix failed:', err);
  process.exit(1);
});
