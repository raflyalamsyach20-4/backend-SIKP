DO $$ BEGIN
 CREATE TYPE "approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "internship_status" AS ENUM('PENDING', 'AKTIF', 'SELESAI', 'DIBATALKAN');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "logbook_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "report_status" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'NEEDS_REVISION', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "title_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
	 SELECT 1
	 FROM pg_enum e
	 JOIN pg_type t ON t.oid = e.enumtypid
	 WHERE t.typname = 'document_type' AND e.enumlabel = 'SURAT_PENGANTAR'
 ) THEN
	 ALTER TYPE "document_type" ADD VALUE 'SURAT_PENGANTAR';
 END IF;
END $$;--> statement-breakpoint
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
	"pdf_url" text,
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
	"pdf_url" text,
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
	"mahasiswa_id" varchar(20) NOT NULL,
	"team_id" text,
	"pembimbing_lapangan_id" text,
	"dosen_pembimbing_id" text,
	"company_name" varchar(255) NOT NULL,
	"division" varchar(255),
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "internship_status" DEFAULT 'AKTIF' NOT NULL,
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
	"pdf_url" text,
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
	"file_url" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
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
ALTER TABLE "pembimbing_lapangan" ADD COLUMN IF NOT EXISTS "signature" text;--> statement-breakpoint
ALTER TABLE "pembimbing_lapangan" ADD COLUMN IF NOT EXISTS "signature_set_at" timestamp;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "approved_by" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "status_history" json DEFAULT '[]' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessments" ADD CONSTRAINT "assessments_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessments" ADD CONSTRAINT "assessments_pembimbing_lapangan_id_pembimbing_lapangan_id_fk" FOREIGN KEY ("pembimbing_lapangan_id") REFERENCES "pembimbing_lapangan"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "combined_grades" ADD CONSTRAINT "combined_grades_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "combined_grades" ADD CONSTRAINT "combined_grades_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "combined_grades" ADD CONSTRAINT "combined_grades_lecturer_assessment_id_lecturer_assessments_id_fk" FOREIGN KEY ("lecturer_assessment_id") REFERENCES "lecturer_assessments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internships" ADD CONSTRAINT "internships_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internships" ADD CONSTRAINT "internships_mahasiswa_id_mahasiswa_nim_fk" FOREIGN KEY ("mahasiswa_id") REFERENCES "mahasiswa"("nim") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internships" ADD CONSTRAINT "internships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internships" ADD CONSTRAINT "internships_pembimbing_lapangan_id_pembimbing_lapangan_id_fk" FOREIGN KEY ("pembimbing_lapangan_id") REFERENCES "pembimbing_lapangan"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internships" ADD CONSTRAINT "internships_dosen_pembimbing_id_dosen_id_fk" FOREIGN KEY ("dosen_pembimbing_id") REFERENCES "dosen"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lecturer_assessments" ADD CONSTRAINT "lecturer_assessments_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lecturer_assessments" ADD CONSTRAINT "lecturer_assessments_dosen_id_dosen_id_fk" FOREIGN KEY ("dosen_id") REFERENCES "dosen"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "logbooks" ADD CONSTRAINT "logbooks_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "logbooks" ADD CONSTRAINT "logbooks_verified_by_pembimbing_lapangan_id_fk" FOREIGN KEY ("verified_by") REFERENCES "pembimbing_lapangan"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mentor_activation_tokens" ADD CONSTRAINT "mentor_activation_tokens_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mentor_approval_requests" ADD CONSTRAINT "mentor_approval_requests_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mentor_approval_requests" ADD CONSTRAINT "mentor_approval_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mentor_email_change_requests" ADD CONSTRAINT "mentor_email_change_requests_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mentor_email_change_requests" ADD CONSTRAINT "mentor_email_change_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_dosen_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "dosen"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "title_revisions" ADD CONSTRAINT "title_revisions_title_submission_id_title_submissions_id_fk" FOREIGN KEY ("title_submission_id") REFERENCES "title_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "title_revisions" ADD CONSTRAINT "title_revisions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "title_submissions" ADD CONSTRAINT "title_submissions_internship_id_internships_id_fk" FOREIGN KEY ("internship_id") REFERENCES "internships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "title_submissions" ADD CONSTRAINT "title_submissions_approved_by_dosen_id_fk" FOREIGN KEY ("approved_by") REFERENCES "dosen"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
