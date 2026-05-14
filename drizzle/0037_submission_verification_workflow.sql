DO $$ BEGIN
  CREATE TYPE submission_verification_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE workflow_stage AS ENUM (
    'DRAFT',
    'PENDING_ADMIN_REVIEW',
    'PENDING_DOSEN_VERIFICATION',
    'COMPLETED',
    'REJECTED_ADMIN',
    'REJECTED_DOSEN'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "submissions"
  ADD COLUMN IF NOT EXISTS "admin_verification_status" submission_verification_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "admin_verified_at" timestamp,
  ADD COLUMN IF NOT EXISTS "admin_verified_by" text,
  ADD COLUMN IF NOT EXISTS "admin_rejection_reason" text,
  ADD COLUMN IF NOT EXISTS "dosen_verification_status" submission_verification_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "dosen_verified_at" timestamp,
  ADD COLUMN IF NOT EXISTS "dosen_verified_by" text,
  ADD COLUMN IF NOT EXISTS "dosen_rejection_reason" text,
  ADD COLUMN IF NOT EXISTS "workflow_stage" workflow_stage NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "final_signed_file_url" text;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "submissions"
    ADD CONSTRAINT "submissions_admin_verified_by_users_id_fk"
    FOREIGN KEY ("admin_verified_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "submissions"
    ADD CONSTRAINT "submissions_dosen_verified_by_users_id_fk"
    FOREIGN KEY ("dosen_verified_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

UPDATE "submissions"
SET
  "admin_verification_status" = CASE
    WHEN "status" = 'APPROVED' THEN 'APPROVED'::submission_verification_status
    WHEN "status" = 'REJECTED' THEN 'REJECTED'::submission_verification_status
    ELSE COALESCE("admin_verification_status", 'PENDING'::submission_verification_status)
  END,
  "admin_verified_at" = CASE
    WHEN "status" IN ('APPROVED', 'REJECTED') THEN COALESCE("admin_verified_at", "approved_at", "updated_at", "submitted_at")
    ELSE "admin_verified_at"
  END,
  "admin_verified_by" = CASE
    WHEN "status" IN ('APPROVED', 'REJECTED') THEN COALESCE("admin_verified_by", "approved_by")
    ELSE "admin_verified_by"
  END,
  "admin_rejection_reason" = CASE
    WHEN "status" = 'REJECTED' THEN COALESCE("admin_rejection_reason", "rejection_reason")
    ELSE "admin_rejection_reason"
  END,
  "workflow_stage" = CASE
    WHEN "status" = 'DRAFT' THEN 'DRAFT'::workflow_stage
    WHEN "status" = 'PENDING_REVIEW' THEN 'PENDING_ADMIN_REVIEW'::workflow_stage
    WHEN "status" = 'APPROVED' THEN 'PENDING_DOSEN_VERIFICATION'::workflow_stage
    WHEN "status" = 'REJECTED' THEN 'REJECTED_ADMIN'::workflow_stage
    ELSE COALESCE("workflow_stage", 'DRAFT'::workflow_stage)
  END
WHERE true;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_submissions_workflow_stage" ON "submissions" ("workflow_stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_admin_status" ON "submissions" ("admin_verification_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_dosen_status" ON "submissions" ("dosen_verification_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_dosen_queue" ON "submissions" ("workflow_stage", "dosen_verified_by", "created_at");