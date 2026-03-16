DROP INDEX IF EXISTS "uq_submission_per_team";--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "archived_at" timestamp;