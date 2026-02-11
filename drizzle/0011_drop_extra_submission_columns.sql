-- Drop extra columns from submissions table that don't exist in schema
-- Migration: 0011_drop_extra_submission_columns
-- Date: 2026-02-02

ALTER TABLE "submissions" DROP COLUMN IF EXISTS "company_phone";

ALTER TABLE "submissions" DROP COLUMN IF EXISTS "company_email";

ALTER TABLE "submissions" DROP COLUMN IF EXISTS "company_supervisor";

ALTER TABLE "submissions" DROP COLUMN IF EXISTS "position";

ALTER TABLE "submissions" DROP COLUMN IF EXISTS "approved_by";
