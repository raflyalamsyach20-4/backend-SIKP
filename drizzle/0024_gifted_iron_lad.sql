DO $$ BEGIN
 CREATE TYPE "surat_permohonan_status" AS ENUM('MENUNGGU', 'DISETUJUI', 'DITOLAK');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "surat_permohonan_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"member_user_id" text NOT NULL,
	"dosen_user_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"status" "surat_permohonan_status" DEFAULT 'MENUNGGU' NOT NULL,
	"signed_file_url" text,
	"signed_file_key" text,
	"rejection_reason" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"approved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surat_permohonan_dosen_status" ON "surat_permohonan_requests" ("dosen_user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surat_permohonan_requested_at" ON "surat_permohonan_requests" ("requested_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surat_permohonan_member_dosen_status" ON "surat_permohonan_requests" ("member_user_id","dosen_user_id","status");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surat_permohonan_requests" ADD CONSTRAINT "surat_permohonan_requests_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surat_permohonan_requests" ADD CONSTRAINT "surat_permohonan_requests_dosen_user_id_users_id_fk" FOREIGN KEY ("dosen_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surat_permohonan_requests" ADD CONSTRAINT "surat_permohonan_requests_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surat_permohonan_requests" ADD CONSTRAINT "surat_permohonan_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
