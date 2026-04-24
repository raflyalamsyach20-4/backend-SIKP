import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

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
  if (!db) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  for (const col of legacyColumns) {
    // Safe repeated execution for environments with partial schema drift.
    await db.execute(sql.raw(`ALTER TABLE "dosen" DROP COLUMN IF EXISTS "${col}"`));
  }

  const rows = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dosen'
    ORDER BY ordinal_position;
  `);

  console.log('Columns in dosen:');
  for (const row of rows as unknown as Array<{ column_name: string; data_type: string }>) {
    console.log(`- ${row.column_name}: ${row.data_type}`);
  }
};

run().catch((error) => {
  console.error('Failed to cleanup dosen columns:', error);
  process.exit(1);
});
