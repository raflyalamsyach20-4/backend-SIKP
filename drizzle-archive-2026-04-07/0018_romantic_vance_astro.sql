DO $$ BEGIN
 CREATE TYPE "surat_kesediaan_status" AS ENUM('MENUNGGU', 'DISETUJUI', 'DITOLAK');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "surat_kesediaan_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"member_user_id" text NOT NULL,
	"dosen_user_id" text NOT NULL,
	"status" "surat_kesediaan_status" DEFAULT 'MENUNGGU' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_surat_kesediaan_request" ON "surat_kesediaan_requests" ("submission_id","member_user_id","dosen_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surat_kesediaan_dosen_status" ON "surat_kesediaan_requests" ("dosen_user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surat_kesediaan_created_at" ON "surat_kesediaan_requests" ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surat_kesediaan_requests" ADD CONSTRAINT "surat_kesediaan_requests_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surat_kesediaan_requests" ADD CONSTRAINT "surat_kesediaan_requests_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surat_kesediaan_requests" ADD CONSTRAINT "surat_kesediaan_requests_dosen_user_id_users_id_fk" FOREIGN KEY ("dosen_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surat_kesediaan_requests" ADD CONSTRAINT "surat_kesediaan_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
