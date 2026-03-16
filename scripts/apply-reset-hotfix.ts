import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log('Applying reset hotfix SQL...');

  await sql('ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "archived_at" timestamp');
  await sql('DROP INDEX IF EXISTS "uq_submission_per_team"');

  console.log('Hotfix applied successfully.');
}

main().catch((err) => {
  console.error('Hotfix failed:', err);
  process.exit(1);
});
