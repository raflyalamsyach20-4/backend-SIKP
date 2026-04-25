ALTER TABLE "teams" ADD COLUMN "code" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN IF EXISTS "created_at";--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "name";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "created_at";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_code_unique" UNIQUE("code");