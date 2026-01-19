-- Remove old constraint and columns from users table
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_nim_unique";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "nim";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "name";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "faculty";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "major";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "semester";
--> statement-breakpoint
-- Add missing columns if they don't exist
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nama" varchar(255);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
--> statement-breakpoint
-- Update NOT NULL constraints
ALTER TABLE "users" ALTER COLUMN "is_active" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_active" SET DEFAULT true;
