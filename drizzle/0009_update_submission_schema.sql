-- Add new columns to submissions table
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "letter_purpose" varchar(255);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "division" varchar(255);

-- Add new columns to submission_documents table
--> statement-breakpoint
ALTER TABLE "submission_documents" ADD COLUMN IF NOT EXISTS "member_user_id" text;
--> statement-breakpoint
ALTER TABLE "submission_documents" ADD COLUMN IF NOT EXISTS "uploaded_by_user_id" text;

-- Add foreign key constraints
DO $$ BEGIN
  ALTER TABLE "submission_documents" ADD CONSTRAINT "submission_documents_member_user_id_fk" 
  FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "submission_documents" ADD CONSTRAINT "submission_documents_uploaded_by_user_id_fk" 
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create unique index
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_document_per_member" 
ON "submission_documents" ("submission_id", "document_type", "member_user_id");

-- Drop old columns if they exist
--> statement-breakpoint
ALTER TABLE "submission_documents" DROP COLUMN IF EXISTS "uploaded_by" CASCADE;
--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "company_phone" CASCADE;
--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "company_email" CASCADE;
--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "position" CASCADE;
--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "description" CASCADE;
