-- Alter teams table to match new schema
-- Add code column if it doesn't exist
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "code" varchar(50);
--> statement-breakpoint
-- Drop timestamps from team_members
ALTER TABLE "team_members" DROP COLUMN IF EXISTS "created_at";
--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN IF EXISTS "updated_at";
--> statement-breakpoint
-- Add unique constraint on code (if code has values)
ALTER TABLE "teams" ADD CONSTRAINT "teams_code_unique" UNIQUE("code");
