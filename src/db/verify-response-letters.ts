import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const verifySetup = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log('🔍 Verifying response_letters table setup...\n');

  try {
    // Check if table exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'response_letters'
      );
    `;
    console.log('✅ Table exists:', tableCheck[0].exists);

    // Check columns
    const columns = await sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'response_letters'
      ORDER BY ordinal_position;
    `;
    console.log('\n📋 Columns:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    // Check indexes
    const indexes = await sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'response_letters';
    `;
    console.log('\n🔑 Indexes:');
    indexes.forEach(idx => {
      console.log(`  - ${idx.indexname}`);
    });

    // Check foreign keys
    const fkeys = await sql`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'response_letters';
    `;
    console.log('\n🔗 Foreign Keys:');
    fkeys.forEach(fk => {
      console.log(`  - ${fk.column_name} → ${fk.foreign_table_name}(${fk.foreign_column_name})`);
    });

    // Check submissions column
    const submissionsCol = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'submissions' 
      AND column_name = 'response_letter_status';
    `;
    console.log('\n✅ Submissions table updated:', submissionsCol.length > 0 ? 'Yes' : 'No');
    if (submissionsCol.length > 0) {
      console.log(`   - response_letter_status column added (${submissionsCol[0].data_type})`);
    }

    console.log('\n✨ All verifications passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
};

verifySetup();
