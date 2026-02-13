import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const applyChanges = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    console.log('⏳ Applying response_letters metadata changes...');

    const statements = [
      'ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "file_type" varchar(100)',
      'ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "original_name" varchar(255)',
      'ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "member_user_id" text',
      'ALTER TABLE "response_letters" ADD CONSTRAINT "response_letters_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE SET NULL',
    ];

    for (const statement of statements) {
      console.log(`Executing: ${statement}`);
      try {
        await sql(statement);
        console.log('✅ Success');
      } catch (error: any) {
        console.log(`⚠️  ${error.message}`);
      }
    }

    console.log('✅ Metadata changes applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to apply changes:', error);
    process.exit(1);
  }
};

applyChanges();
