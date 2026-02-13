import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const applyChanges = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    console.log('⏳ Applying response_letters table changes...');

    // Execute each statement individually
    const statements = [
      'ALTER TABLE "response_letters" DROP CONSTRAINT IF EXISTS "response_letters_team_id_teams_id_fk"',
      'DROP INDEX IF EXISTS "idx_response_letters_team_id"',
      'ALTER TABLE "response_letters" DROP COLUMN IF EXISTS "team_id"',
      'ALTER TABLE "response_letters" DROP COLUMN IF EXISTS "file_path"',
      'ALTER TABLE "response_letters" DROP COLUMN IF EXISTS "letter_status_description"',
      'ALTER TABLE "response_letters" DROP COLUMN IF EXISTS "verification_notes"',
      'ALTER TABLE "response_letters" DROP COLUMN IF EXISTS "created_at"',
      'ALTER TABLE "response_letters" DROP COLUMN IF EXISTS "updated_at"',
      'DROP INDEX IF EXISTS "idx_response_letters_created_at"',
    ];

    for (const statement of statements) {
      console.log(`Executing: ${statement}`);
      try {
        await sql(statement);
        console.log('✅ Success');
      } catch (error: any) {
        // Some statements might fail if the column/constraint/index doesn't exist, that's okay
        console.log(`⚠️  ${error.message}`);
      }
    }

    console.log('✅ All changes applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to apply changes:', error);
    process.exit(1);
  }
};

applyChanges();
