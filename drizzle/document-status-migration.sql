-- Minimal migration for document status feature only
-- Postgres SQL

-- 1) Create enum type if not exists
DO $$ BEGIN
  CREATE TYPE "document_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2) Add columns to submission_documents
ALTER TABLE "submission_documents"
  ADD COLUMN IF NOT EXISTS "status" "document_status" DEFAULT 'PENDING' NOT NULL,
  ADD COLUMN IF NOT EXISTS "status_updated_at" timestamp DEFAULT now() NOT NULL;

-- 3) Add indexes for performance
CREATE INDEX IF NOT EXISTS "idx_submission_status"
  ON "submission_documents" ("submission_id", "status");

CREATE INDEX IF NOT EXISTS "idx_status_updated"
  ON "submission_documents" ("status_updated_at");

-- 4) Backfill status for existing documents based on submission status
-- APPROVED submissions -> APPROVED documents
UPDATE "submission_documents" sd
SET
  "status" = 'APPROVED',
  "status_updated_at" = COALESCE(s."approved_at", s."updated_at", now())
FROM "submissions" s
WHERE sd."submission_id" = s."id"
  AND s."status" = 'APPROVED'
  AND sd."status" = 'PENDING';

-- REJECTED submissions -> REJECTED documents
UPDATE "submission_documents" sd
SET
  "status" = 'REJECTED',
  "status_updated_at" = COALESCE(s."updated_at", now())
FROM "submissions" s
WHERE sd."submission_id" = s."id"
  AND s."status" = 'REJECTED'
  AND sd."status" = 'PENDING';

-- DRAFT / PENDING_REVIEW remain PENDING (no update needed)
