-- Add snapshot fields and keep response_letters after submission deletion
ALTER TABLE "response_letters" DROP CONSTRAINT IF EXISTS "response_letters_submission_id_submissions_id_fk";
--> statement-breakpoint
ALTER TABLE "response_letters" ALTER COLUMN "submission_id" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1
   FROM pg_constraint
   WHERE conname = 'response_letters_submission_id_submissions_id_fk'
 ) THEN
  ALTER TABLE "response_letters"
  ADD CONSTRAINT "response_letters_submission_id_submissions_id_fk"
  FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL;
 END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "student_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "student_nim" varchar(50);
--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "company_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "supervisor_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "member_count" integer;
--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "role_label" varchar(50);
--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "members_snapshot" json;
