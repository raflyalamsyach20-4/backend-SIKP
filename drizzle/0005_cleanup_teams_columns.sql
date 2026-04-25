-- First, populate code column with a default value if null
UPDATE "teams" SET "code" = 'TEAM-' || "id" WHERE "code" IS NULL;
--> statement-breakpoint
-- Clean up teams table - remove columns not in schema
ALTER TABLE "teams" DROP COLUMN IF EXISTS "name";
--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "description";
--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "created_at";
--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "updated_at";
--> statement-breakpoint
-- Make code NOT NULL since schema specifies it
ALTER TABLE "teams" ALTER COLUMN "code" SET NOT NULL;
