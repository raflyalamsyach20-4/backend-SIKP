import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not found');

  const sql = neon(url);

  console.log('🚀 Starting manual database sync...');

  try {
    // 1. Fix mahasiswa_id length
    console.log('- Updating internships.mahasiswa_id length to 255...');
    await sql`ALTER TABLE internships ALTER COLUMN mahasiswa_id TYPE varchar(255);`;
    
    // 2. Ensure archived_at exists in internships
    console.log('- Ensuring internships.archived_at exists...');
    await sql`ALTER TABLE internships ADD COLUMN IF NOT EXISTS archived_at timestamp;`;

    // 3. Ensure tables exist
    console.log('- Ensuring reports and combined_grades tables exist...');
    await sql`
      CREATE TABLE IF NOT EXISTS "reports" (
        "id" text PRIMARY KEY NOT NULL,
        "internship_id" text NOT NULL UNIQUE,
        "title" varchar(500),
        "file_url" text NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "file_size" integer NOT NULL,
        "status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS "combined_grades" (
        "id" text PRIMARY KEY NOT NULL,
        "internship_id" text NOT NULL UNIQUE,
        "final_score" integer NOT NULL,
        "letter_grade" varchar(2),
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `;

    console.log('✅ Manual sync completed successfully.');
  } catch (error) {
    console.error('❌ Error during manual sync:', error);
    process.exit(1);
  }
}

main();
