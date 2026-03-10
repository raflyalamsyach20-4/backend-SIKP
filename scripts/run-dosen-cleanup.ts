import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const legacyColumns = [
  'gelar_depan',
  'gelar_belakang',
  'bidang_keahlian',
  'foto_profile',
  'no_ruangan',
  'jadwal_konsultasi',
  'status_ketersediaan',
  'tentang',
  'penelitian',
  'publikasi',
  'profile_completed',
  'esignature_url',
  'profile_completed_at',
  'last_login_at',
];

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  for (const col of legacyColumns) {
    // Safe repeated execution for environments with partial schema drift.
    await sql(`ALTER TABLE "dosen" DROP COLUMN IF EXISTS "${col}"`);
  }

  const rows = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dosen'
    ORDER BY ordinal_position;
  `;

  console.log('Columns in dosen:');
  for (const row of rows as Array<{ column_name: string; data_type: string }>) {
    console.log(`- ${row.column_name}: ${row.data_type}`);
  }
};

run().catch((error) => {
  console.error('Failed to cleanup dosen columns:', error);
  process.exit(1);
});
