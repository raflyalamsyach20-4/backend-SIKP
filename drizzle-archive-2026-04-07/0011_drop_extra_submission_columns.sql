-- Drop extra columns from submissions table that don't exist in schema
-- Migration: 0011_drop_extra_submission_columns
-- Date: 2026-02-02

ALTER TABLE "submissions" DROP COLUMN IF EXISTS "company_phone";

--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "company_email";

--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "company_supervisor";

--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "position";

--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "approved_by";
