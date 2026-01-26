import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const runCheck = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log('🔍 Checking submission_documents schema...\n');

  // Check table structure
  const result = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'submission_documents'
    ORDER BY ordinal_position;
  `;

  console.log('📋 Columns in submission_documents:');
  result.forEach((col: any) => {
    const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
    console.log(`  - ${col.column_name}: ${col.data_type} ${nullable}`);
  });

  // Check for problematic columns
  console.log('\n⚠️  Checking for old/problematic columns:');
  const hasUploadedBy = result.some((col: any) => col.column_name === 'uploaded_by');
  const hasUploadedByUserId = result.some((col: any) => col.column_name === 'uploaded_by_user_id');
  const hasMemberUserId = result.some((col: any) => col.column_name === 'member_user_id');

  console.log(`  - uploaded_by (old): ${hasUploadedBy ? '❌ EXISTS' : '✅ Dropped'}`);
  console.log(`  - uploaded_by_user_id (new): ${hasUploadedByUserId ? '✅ EXISTS' : '❌ Missing'}`);
  console.log(`  - member_user_id (new): ${hasMemberUserId ? '✅ EXISTS' : '❌ Missing'}`);

  if (!hasUploadedByUserId || !hasMemberUserId) {
    console.log('\n❌ ERROR: New columns are missing!');
    process.exit(1);
  }

  if (hasUploadedBy) {
    console.log('\n❌ ERROR: Old uploaded_by column still exists!');
    process.exit(1);
  }

  console.log('\n✅ Schema is correct!');
};

runCheck().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
