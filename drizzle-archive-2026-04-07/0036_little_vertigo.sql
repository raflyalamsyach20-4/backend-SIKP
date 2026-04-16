DO $$ BEGIN
 CREATE TYPE "submission_verification_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "workflow_stage" AS ENUM('DRAFT', 'PENDING_ADMIN_REVIEW', 'PENDING_DOSEN_VERIFICATION', 'COMPLETED', 'REJECTED_ADMIN', 'REJECTED_DOSEN');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "admin_verification_status" "submission_verification_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "admin_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "admin_verified_by" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "admin_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "dosen_verification_status" "submission_verification_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "dosen_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "dosen_verified_by" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "dosen_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "workflow_stage" "workflow_stage" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "final_signed_file_url" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_workflow_stage" ON "submissions" ("workflow_stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_admin_status" ON "submissions" ("admin_verification_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_dosen_status" ON "submissions" ("dosen_verification_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_dosen_queue" ON "submissions" ("workflow_stage","dosen_verified_by","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_admin_verified_by_users_id_fk" FOREIGN KEY ("admin_verified_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_dosen_verified_by_users_id_fk" FOREIGN KEY ("dosen_verified_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
