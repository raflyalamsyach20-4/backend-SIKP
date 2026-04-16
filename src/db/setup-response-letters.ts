import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const runDirectSQL = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log('⏳ Creating response_letters table and related structures...');

  try {
    // Step 1: Create enums (use DO block to handle existing types)
    console.log('Creating letter_status enum...');
    await sql`
      DO $$ 
      BEGIN
        CREATE TYPE letter_status AS ENUM('approved', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    
    console.log('Creating response_letter_status enum...');
    await sql`
      DO $$ 
      BEGIN
        CREATE TYPE response_letter_status AS ENUM('pending', 'submitted', 'verified');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    // Step 2: Create table
    console.log('Creating response_letters table...');
    await sql`
      CREATE TABLE IF NOT EXISTS response_letters (
        id text PRIMARY KEY NOT NULL,
        submission_id text NOT NULL,
        original_name varchar(255),
        file_name varchar(255),
        file_type varchar(100),
        file_size bigint,
        file_url text,
        member_user_id text,
        letter_status letter_status NOT NULL,
        submitted_at timestamp DEFAULT now() NOT NULL,
        verified boolean DEFAULT false NOT NULL,
        verified_at timestamp,
        verified_by_admin_id text
      )
    `;

    // Step 3: Add column to submissions
    console.log('Adding response_letter_status column to submissions...');
    await sql`
      ALTER TABLE submissions 
      ADD COLUMN IF NOT EXISTS response_letter_status response_letter_status DEFAULT 'pending'
    `;

    // Step 4: Create indexes
    console.log('Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_response_letters_submission_id ON response_letters (submission_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_response_letters_verified ON response_letters (verified)`;

    // Step 5: Add foreign keys
    console.log('Adding foreign keys...');
    await sql`
      ALTER TABLE response_letters 
      DROP CONSTRAINT IF EXISTS response_letters_submission_id_submissions_id_fk
    `;
    await sql`
      ALTER TABLE response_letters 
      ADD CONSTRAINT response_letters_submission_id_submissions_id_fk 
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
    `;

    await sql`
      ALTER TABLE response_letters 
      DROP CONSTRAINT IF EXISTS response_letters_member_user_id_users_id_fk
    `;
    await sql`
      ALTER TABLE response_letters 
      ADD CONSTRAINT response_letters_member_user_id_users_id_fk 
      FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE SET NULL
    `;

    await sql`
      ALTER TABLE response_letters 
      DROP CONSTRAINT IF EXISTS response_letters_verified_by_admin_id_users_id_fk
    `;
    await sql`
      ALTER TABLE response_letters 
      ADD CONSTRAINT response_letters_verified_by_admin_id_users_id_fk 
      FOREIGN KEY (verified_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
    `;

    console.log('✅ Response letters table setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
};

runDirectSQL();
