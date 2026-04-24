import * as dotenv from 'dotenv';
import { getMaintenanceSql } from './maintenance-client';

dotenv.config({ path: '.env' });

const cleanDatabase = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  const sql = getMaintenanceSql();

  console.log('🧹 Cleaning up database (deleting all data)...\n');

  try {
    // Delete in correct order to respect foreign keys
    console.log('Deleting from generated_letters...');
    await sql`DELETE FROM "generated_letters"`;

    console.log('Deleting from submission_documents...');
    await sql`DELETE FROM "submission_documents"`;

    console.log('Deleting from submissions...');
    await sql`DELETE FROM "submissions"`;

    console.log('Deleting from team_members...');
    await sql`DELETE FROM "team_members"`;

    console.log('Deleting from teams...');
    await sql`DELETE FROM "teams"`;

    console.log('Deleting from mahasiswa...');
    await sql`DELETE FROM "mahasiswa"`;

    console.log('Deleting from admin...');
    await sql`DELETE FROM "admin"`;

    console.log('Deleting from dosen...');
    await sql`DELETE FROM "dosen"`;

    console.log('Deleting from pembimbing_lapangan...');
    await sql`DELETE FROM "pembimbing_lapangan"`;

    console.log('Deleting from users...');
    await sql`DELETE FROM "users"`;

    console.log('\n✅ Database cleaned successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error cleaning database:', error);
    process.exit(1);
  }
};

cleanDatabase();
