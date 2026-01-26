-- Add new columns to submissions table
ALTER TABLE "submissions" ADD COLUMN "letter_purpose" varchar(255);
ALTER TABLE "submissions" ADD COLUMN "division" varchar(255);

-- Add new columns to submission_documents table
ALTER TABLE "submission_documents" ADD COLUMN "member_user_id" text;
ALTER TABLE "submission_documents" ADD COLUMN "uploaded_by_user_id" text;

-- Add foreign key constraints
DO $$ BEGIN
  ALTER TABLE "submission_documents" ADD CONSTRAINT "submission_documents_member_user_id_fk" 
  FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "submission_documents" ADD CONSTRAINT "submission_documents_uploaded_by_user_id_fk" 
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS "uq_document_per_member" 
ON "submission_documents" ("submission_id", "document_type", "member_user_id");

-- Drop old columns if they exist
ALTER TABLE "submission_documents" DROP COLUMN IF EXISTS "uploaded_by" CASCADE;
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "company_phone" CASCADE;
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "company_email" CASCADE;
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "position" CASCADE;
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "description" CASCADE;
