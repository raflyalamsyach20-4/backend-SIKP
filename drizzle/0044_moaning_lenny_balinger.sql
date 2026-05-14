DO $$ BEGIN CREATE TYPE "public"."approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."internship_status" AS ENUM('PENDING', 'AKTIF', 'SELESAI', 'DIBATALKAN'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."logbook_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."report_status" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'NEEDS_REVISION', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."title_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"internship_id" text NOT NULL,
	"pembimbing_lapangan_id" text NOT NULL,
	"kehadiran" integer NOT NULL,
	"kerjasama" integer NOT NULL,
	"sikap_etika" integer NOT NULL,
	"prestasi_kerja" integer NOT NULL,
	"kreatifitas" integer NOT NULL,
	"total_score" integer NOT NULL,
	"feedback" text,
	"file_name" varchar(255),
	"file_url" text,
	"file_type" varchar(100),
	"file_size" integer,
	"original_name" varchar(255),
	"pdf_generated" boolean DEFAULT false NOT NULL,
	"assessed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" text NOT NULL,
	"details" json DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"auth_user_id" varchar(255) NOT NULL,
	"active_identity" varchar(100),
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"expires_at" timestamp NOT NULL,
	"profile_snapshot" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "combined_grades" (
	"id" text PRIMARY KEY NOT NULL,
	"internship_id" text NOT NULL,
	"assessment_id" text,
	"lecturer_assessment_id" text,
	"field_score" integer,
	"academic_score" integer,
	"final_score" integer NOT NULL,
	"letter_grade" varchar(2),
	"status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"file_name" varchar(255),
	"file_url" text,
	"file_type" varchar(100),
	"file_size" integer,
	"original_name" varchar(255),
	"pdf_generated" boolean DEFAULT false NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "combined_grades_internship_id_unique" UNIQUE("internship_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "internships" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"mahasiswa_id" varchar(255) NOT NULL,
	"team_id" text,
	"pembimbing_lapangan_id" text,
	"dosen_pembimbing_id" text,
	"company_name" varchar(255) NOT NULL,
	"division" varchar(255),
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "internship_status" DEFAULT 'AKTIF' NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lecturer_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"internship_id" text NOT NULL,
	"dosen_id" text NOT NULL,
	"format_kesesuaian" integer NOT NULL,
	"penguasaan_materi" integer NOT NULL,
	"analisis_perancangan" integer NOT NULL,
	"sikap_etika" integer NOT NULL,
	"total_score" integer NOT NULL,
	"feedback" text,
	"file_name" varchar(255),
	"file_url" text,
	"file_type" varchar(100),
	"file_size" integer,
	"original_name" varchar(255),
	"pdf_generated" boolean DEFAULT false NOT NULL,
	"assessed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "logbooks" (
	"id" text PRIMARY KEY NOT NULL,
	"internship_id" text NOT NULL,
	"date" date NOT NULL,
	"activity" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"hours" integer,
	"status" "logbook_status" DEFAULT 'PENDING' NOT NULL,
	"file_name" varchar(255),
	"file_url" text,
	"file_type" varchar(100),
	"file_size" integer,
	"original_name" varchar(255),
	"rejection_reason" text,
	"verified_by" text,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mentor_activation_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"mentor_id" text NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_activation_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mentor_approval_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"student_user_id" text NOT NULL,
	"mentor_name" varchar(255) NOT NULL,
	"mentor_email" varchar(255) NOT NULL,
	"mentor_phone" varchar(20),
	"company_name" varchar(255),
	"position" varchar(100),
	"company_address" text,
	"status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"sso_mentor_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mentor_email_change_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"mentor_id" text NOT NULL,
	"current_email" varchar(255) NOT NULL,
	"requested_email" varchar(255) NOT NULL,
	"reason" text,
	"status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mentor_signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"signature_url" text,
	"signature_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"internship_id" text NOT NULL,
	"title" varchar(500),
	"abstract" text,
	"file_name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"file_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"status" "report_status" DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"approval_status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"comments" text,
	"revision_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reports_internship_id_unique" UNIQUE("internship_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "title_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"title_submission_id" text NOT NULL,
	"revised_title" varchar(500) NOT NULL,
	"change_reason" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"requested_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "title_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"internship_id" text NOT NULL,
	"proposed_title" varchar(500) NOT NULL,
	"description" text,
	"status" "title_status" DEFAULT 'PENDING' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"rejection_reason" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "admin" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "dosen" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "mahasiswa" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "pembimbing_lapangan" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "users" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "admin" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "dosen" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "mahasiswa" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "pembimbing_lapangan" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "users" CASCADE;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "generated_letters" DROP CONSTRAINT "generated_letters_generated_by_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "response_letters" DROP CONSTRAINT "response_letters_member_user_id_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "response_letters" DROP CONSTRAINT "response_letters_verified_by_admin_id_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "submission_documents" DROP CONSTRAINT "submission_documents_member_user_id_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "submission_documents" DROP CONSTRAINT "submission_documents_uploaded_by_user_id_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "submissions" DROP CONSTRAINT "submissions_approved_by_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "submissions" DROP CONSTRAINT "submissions_admin_verified_by_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "submissions" DROP CONSTRAINT "submissions_dosen_verified_by_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "surat_kesediaan_requests" DROP CONSTRAINT "surat_kesediaan_requests_member_user_id_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "surat_kesediaan_requests" DROP CONSTRAINT "surat_kesediaan_requests_dosen_user_id_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "surat_kesediaan_requests" DROP CONSTRAINT "surat_kesediaan_requests_approved_by_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "surat_permohonan_requests" DROP CONSTRAINT "surat_permohonan_requests_member_user_id_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "surat_permohonan_requests" DROP CONSTRAINT "surat_permohonan_requests_dosen_user_id_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "surat_permohonan_requests" DROP CONSTRAINT "surat_permohonan_requests_approved_by_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "team_members" DROP CONSTRAINT "team_members_user_id_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "team_members" DROP CONSTRAINT "team_members_invited_by_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "teams" DROP CONSTRAINT "teams_leader_id_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "teams" DROP CONSTRAINT "teams_dosen_kp_id_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "templates" DROP CONSTRAINT "templates_created_by_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "templates" DROP CONSTRAINT "templates_updated_by_users_id_fk"; EXCEPTION WHEN undefined_object THEN null; END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_document_per_member";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_submissions_dosen_queue";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_surat_kesediaan_request";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_surat_kesediaan_dosen_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_surat_kesediaan_member_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_permohonan_dosen";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_surat_permohonan_member_dosen_status";--> statement-breakpoint
ALTER TABLE "generated_letters" ADD COLUMN IF NOT EXISTS "generated_by_admin_id" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "generated_letters" ALTER COLUMN "generated_by_admin_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "response_letters" ADD COLUMN IF NOT EXISTS "member_mahasiswa_id" text;--> statement-breakpoint
ALTER TABLE "submission_documents" ADD COLUMN IF NOT EXISTS "member_mahasiswa_id" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "submission_documents" ALTER COLUMN "member_mahasiswa_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "submission_documents" ADD COLUMN IF NOT EXISTS "uploaded_by_mahasiswa_id" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "submission_documents" ALTER COLUMN "uploaded_by_mahasiswa_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "approved_by_admin_id" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "admin_verified_by_admin_id" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "dosen_verified_by_dosen_id" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "letter_number" varchar(100);--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" ADD COLUMN IF NOT EXISTS "member_mahasiswa_id" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" ALTER COLUMN "member_mahasiswa_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" ADD COLUMN IF NOT EXISTS "dosen_id" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" ALTER COLUMN "dosen_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" ADD COLUMN IF NOT EXISTS "approved_by_dosen_id" text;--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" ADD COLUMN IF NOT EXISTS "member_mahasiswa_id" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" ALTER COLUMN "member_mahasiswa_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" ADD COLUMN IF NOT EXISTS "dosen_id" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" ALTER COLUMN "dosen_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" ADD COLUMN IF NOT EXISTS "approved_by_dosen_id" text;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "mahasiswa_id" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "mahasiswa_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "invited_by_mahasiswa_id" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "leader_mahasiswa_id" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "leader_mahasiswa_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "created_by_admin_id" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "created_by_admin_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "updated_by_admin_id" text;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assessments" ADD CONSTRAINT "assessments_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "public"."internships"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "combined_grades" ADD CONSTRAINT "combined_grades_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "public"."internships"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "combined_grades" ADD CONSTRAINT "combined_grades_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "combined_grades" ADD CONSTRAINT "combined_grades_lecturer_assessment_id_lecturer_assessments_id_fk" FOREIGN KEY ("lecturer_assessment_id") REFERENCES "public"."lecturer_assessments"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "internships" ADD CONSTRAINT "internships_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "internships" ADD CONSTRAINT "internships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "lecturer_assessments" ADD CONSTRAINT "lecturer_assessments_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "public"."internships"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "logbooks" ADD CONSTRAINT "logbooks_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "public"."internships"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "reports" ADD CONSTRAINT "reports_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "public"."internships"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "title_revisions" ADD CONSTRAINT "title_revisions_title_submission_id_title_submissions_id_fk" FOREIGN KEY ("title_submission_id") REFERENCES "public"."title_submissions"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "title_submissions" ADD CONSTRAINT "title_submissions_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "public"."internships"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auth_sessions_auth_user_id" ON "auth_sessions" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auth_sessions_expires_at" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submissions_letter_number_unique" ON "submissions" USING btree ("letter_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_document_per_member" ON "submission_documents" USING btree ("submission_id","document_type","member_mahasiswa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_dosen_queue" ON "submissions" USING btree ("workflow_stage","dosen_verified_by_dosen_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_surat_kesediaan_request" ON "surat_kesediaan_requests" USING btree ("member_mahasiswa_id","dosen_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surat_kesediaan_dosen_status" ON "surat_kesediaan_requests" USING btree ("dosen_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surat_kesediaan_member_status" ON "surat_kesediaan_requests" USING btree ("member_mahasiswa_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_permohonan_dosen" ON "surat_permohonan_requests" USING btree ("dosen_id","status","requested_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surat_permohonan_member_dosen_status" ON "surat_permohonan_requests" USING btree ("member_mahasiswa_id","dosen_id","status");--> statement-breakpoint
ALTER TABLE "generated_letters" DROP COLUMN IF EXISTS "generated_by";--> statement-breakpoint
ALTER TABLE "response_letters" DROP COLUMN IF EXISTS "member_user_id";--> statement-breakpoint
ALTER TABLE "submission_documents" DROP COLUMN IF EXISTS "member_user_id";--> statement-breakpoint
ALTER TABLE "submission_documents" DROP COLUMN IF EXISTS "uploaded_by_user_id";--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "approved_by";--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "admin_verified_by";--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN IF EXISTS "dosen_verified_by";--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" DROP COLUMN IF EXISTS "member_user_id";--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" DROP COLUMN IF EXISTS "dosen_user_id";--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" DROP COLUMN IF EXISTS "approved_by";--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" DROP COLUMN IF EXISTS "member_user_id";--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" DROP COLUMN IF EXISTS "dosen_user_id";--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" DROP COLUMN IF EXISTS "approved_by";--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN IF EXISTS "user_id";--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN IF EXISTS "invited_by";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "leader_id";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN IF EXISTS "created_by";--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN IF EXISTS "updated_by";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."role";
