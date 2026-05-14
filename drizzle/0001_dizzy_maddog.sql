ALTER TABLE "admin" ALTER COLUMN "nip" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "admin" DROP COLUMN IF EXISTS "position";--> statement-breakpoint
ALTER TABLE "admin" ADD CONSTRAINT "admin_nip_unique" UNIQUE("nip");