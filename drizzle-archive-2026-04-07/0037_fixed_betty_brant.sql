ALTER TABLE "mahasiswa" ADD COLUMN "dosen_pa_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mahasiswa" ADD CONSTRAINT "mahasiswa_dosen_pa_id_users_id_fk" FOREIGN KEY ("dosen_pa_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
