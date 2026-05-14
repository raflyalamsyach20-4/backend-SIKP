ALTER TABLE "teams" ADD COLUMN "dosen_kp_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_dosen_kp_id_users_id_fk" FOREIGN KEY ("dosen_kp_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "academic_supervisor";
