import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const runFix = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log('🔧 Dropping old uploaded_by column...\n');

  try {
    // Drop the constraint if exists
    await sql`
      ALTER TABLE "submission_documents" 
      DROP CONSTRAINT IF EXISTS "submission_documents_uploaded_by_users_id_fk" CASCADE;
    `;
    console.log('✅ Dropped constraint (if existed)');

    // Drop the column
    await sql`
      ALTER TABLE "submission_documents" 
      DROP COLUMN IF EXISTS "uploaded_by" CASCADE;
    `;
    console.log('✅ Dropped column uploaded_by');

    // Verify
    const result = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'submission_documents' AND column_name = 'uploaded_by';
    `;

    if (result.length === 0) {
      console.log('\n✅ SUCCESS: Column successfully dropped!');
    } else {
      console.log('\n❌ ERROR: Column still exists!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

runFix();
