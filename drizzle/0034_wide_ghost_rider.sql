DROP INDEX IF EXISTS "uq_submission_per_team";--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;