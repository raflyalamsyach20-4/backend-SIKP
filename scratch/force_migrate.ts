
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const sql = neon(process.env.DATABASE_URL!);

async function run() {
  console.log('Starting manual migration (sequential)...');
  const commands = [
    'ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "file_name" varchar(255)',
    'ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "file_url" text',
    'ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "file_type" varchar(100)',
    'ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "file_size" integer',
    'ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "original_name" varchar(255)',
    'ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "pdf_generated" boolean DEFAULT false',
    'ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "is_locked" boolean DEFAULT true',

    'ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "file_name" varchar(255)',
    'ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "file_url" text',
    'ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "file_type" varchar(100)',
    'ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "file_size" integer',
    'ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "original_name" varchar(255)',
    'ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "pdf_generated" boolean DEFAULT false',
    'ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "is_locked" boolean DEFAULT true',

    'ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "file_name" varchar(255)',
    'ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "file_url" text',
    'ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "file_type" varchar(100)',
    'ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "file_size" integer',
    'ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "original_name" varchar(255)',
    'ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "pdf_generated" boolean DEFAULT false',

    'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = \'report_status\') THEN CREATE TYPE report_status AS ENUM (\'DRAFT\', \'SUBMITTED\', \'APPROVED\', \'NEEDS_REVISION\', \'REJECTED\'); END IF; END $$',
    'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = \'approval_status\') THEN CREATE TYPE approval_status AS ENUM (\'PENDING\', \'APPROVED\', \'REJECTED\'); END IF; END $$',

    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "title" varchar(500)',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "abstract" text',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "file_name" varchar(255)',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "file_url" text',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "file_type" varchar(100)',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "file_size" integer',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "original_name" varchar(255)',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "status" report_status DEFAULT \'DRAFT\'',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "reviewed_by" text',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "approval_status" approval_status DEFAULT \'PENDING\'',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "comments" text',
    'ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "revision_notes" text'



  ];

  for (const cmd of commands) {
    try {
      console.log(`Executing: ${cmd}`);
      await sql.query(cmd);
    } catch (err) {
      console.error(`Failed to execute: ${cmd}`, err);
    }
  }
  console.log('Sequential migration complete!');
}

run();
