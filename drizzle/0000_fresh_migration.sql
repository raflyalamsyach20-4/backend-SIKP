CREATE TYPE "public"."document_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('PROPOSAL_KETUA', 'SURAT_KESEDIAAN', 'FORM_PERMOHONAN', 'KRS_SEMESTER_4', 'DAFTAR_KUMPULAN_NILAI', 'BUKTI_PEMBAYARAN_UKT', 'SURAT_PENGANTAR');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."letter_status" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."response_letter_status" AS ENUM('pending', 'submitted', 'verified');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('MAHASISWA', 'ADMIN', 'DOSEN', 'KAPRODI', 'WAKIL_DEKAN', 'PEMBIMBING_LAPANGAN');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."submission_verification_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."surat_kesediaan_status" AS ENUM('MENUNGGU', 'DISETUJUI', 'DITOLAK');--> statement-breakpoint
CREATE TYPE "public"."surat_permohonan_status" AS ENUM('MENUNGGU', 'DISETUJUI', 'DITOLAK');--> statement-breakpoint
CREATE TYPE "public"."team_status" AS ENUM('PENDING', 'FIXED');--> statement-breakpoint
CREATE TYPE "public"."workflow_stage" AS ENUM('DRAFT', 'PENDING_ADMIN_REVIEW', 'PENDING_DOSEN_VERIFICATION', 'COMPLETED', 'REJECTED_ADMIN', 'REJECTED_DOSEN');--> statement-breakpoint
CREATE TABLE "admin" (
	"id" text PRIMARY KEY NOT NULL,
	"nip" varchar(30) NOT NULL,
	"fakultas" varchar(100),
	"prodi" varchar(100),
	CONSTRAINT "admin_nip_unique" UNIQUE("nip")
);
--> statement-breakpoint
CREATE TABLE "dosen" (
	"id" text PRIMARY KEY NOT NULL,
	"nip" varchar(30) NOT NULL,
	"jabatan" varchar(100),
	"fakultas" varchar(100),
	"prodi" varchar(100),
	"esignature_url" text,
	"esignature_key" varchar(255),
	"esignature_uploaded_at" timestamp,
	CONSTRAINT "dosen_nip_unique" UNIQUE("nip")
);
--> statement-breakpoint
CREATE TABLE "generated_letters" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"letter_number" varchar(100) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"file_type" varchar(10) NOT NULL,
	"generated_by" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "generated_letters_letter_number_unique" UNIQUE("letter_number")
);
--> statement-breakpoint
CREATE TABLE "mahasiswa" (
	"nim" varchar(20) PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"dosen_pa_id" text,
	"fakultas" varchar(100),
	"prodi" varchar(100),
	"semester" integer,
	"jumlah_sks_selesai" integer,
	"angkatan" varchar(10),
	"esignature_url" text,
	"esignature_key" varchar(255),
	"esignature_uploaded_at" timestamp,
	CONSTRAINT "mahasiswa_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "pembimbing_lapangan" (
	"id" text PRIMARY KEY NOT NULL,
	"company_name" varchar(255),
	"position" varchar(100),
	"company_address" text
);
--> statement-breakpoint
CREATE TABLE "response_letters" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text,
	"original_name" varchar(255),
	"file_name" varchar(255),
	"file_type" varchar(100),
	"file_size" bigint,
	"file_url" text,
	"member_user_id" text,
	"letter_status" "letter_status" NOT NULL,
	"student_name" varchar(255),
	"student_nim" varchar(50),
	"company_name" varchar(255),
	"supervisor_name" varchar(255),
	"member_count" integer,
	"role_label" varchar(50),
	"members_snapshot" json,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"verified_by_admin_id" text
);
--> statement-breakpoint
CREATE TABLE "submission_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"document_type" "document_type" NOT NULL,
	"member_user_id" text NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"file_url" text NOT NULL,
	"status" "document_status" DEFAULT 'PENDING' NOT NULL,
	"status_updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"letter_purpose" varchar(255) NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"company_address" text NOT NULL,
	"company_phone" varchar(50),
	"company_business_type" varchar(255),
	"division" varchar(255) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "submission_status" DEFAULT 'DRAFT' NOT NULL,
	"rejection_reason" text,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"approved_by" text,
	"admin_verification_status" "submission_verification_status" DEFAULT 'PENDING' NOT NULL,
	"admin_verified_at" timestamp,
	"admin_verified_by" text,
	"admin_rejection_reason" text,
	"dosen_verification_status" "submission_verification_status" DEFAULT 'PENDING' NOT NULL,
	"dosen_verified_at" timestamp,
	"dosen_verified_by" text,
	"dosen_rejection_reason" text,
	"letter_number" varchar(100),
	"workflow_stage" "workflow_stage" DEFAULT 'DRAFT' NOT NULL,
	"final_signed_file_url" text,
	"document_reviews" json DEFAULT '{}',
	"status_history" json DEFAULT '[]' NOT NULL,
	"response_letter_status" "response_letter_status" DEFAULT 'pending',
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surat_kesediaan_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"member_user_id" text NOT NULL,
	"dosen_user_id" text NOT NULL,
	"status" "surat_kesediaan_status" DEFAULT 'MENUNGGU' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"signed_file_url" text,
	"signed_file_key" text,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surat_permohonan_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"member_user_id" text NOT NULL,
	"dosen_user_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"status" "surat_permohonan_status" DEFAULT 'MENUNGGU' NOT NULL,
	"mahasiswa_esignature_url" text,
	"mahasiswa_esignature_snapshot_at" timestamp,
	"signed_file_url" text,
	"signed_file_key" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"approved_by" text,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'ANGGOTA' NOT NULL,
	"invitation_status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"invited_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	"invited_by" text
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"leader_id" text NOT NULL,
	"dosen_kp_id" text,
	"status" "team_status" DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "teams_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"description" text,
	"file_name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"file_size" bigint NOT NULL,
	"file_type" varchar(100) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"fields" json,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"nama" varchar(255),
	"email" varchar(255) NOT NULL,
	"password" text NOT NULL,
	"role" "role" DEFAULT 'MAHASISWA' NOT NULL,
	"phone" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "admin" ADD CONSTRAINT "admin_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dosen" ADD CONSTRAINT "dosen_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_letters" ADD CONSTRAINT "generated_letters_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_letters" ADD CONSTRAINT "generated_letters_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mahasiswa" ADD CONSTRAINT "mahasiswa_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mahasiswa" ADD CONSTRAINT "mahasiswa_dosen_pa_id_users_id_fk" FOREIGN KEY ("dosen_pa_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pembimbing_lapangan" ADD CONSTRAINT "pembimbing_lapangan_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_letters" ADD CONSTRAINT "response_letters_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_letters" ADD CONSTRAINT "response_letters_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_letters" ADD CONSTRAINT "response_letters_verified_by_admin_id_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_documents" ADD CONSTRAINT "submission_documents_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_documents" ADD CONSTRAINT "submission_documents_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_documents" ADD CONSTRAINT "submission_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_admin_verified_by_users_id_fk" FOREIGN KEY ("admin_verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_dosen_verified_by_users_id_fk" FOREIGN KEY ("dosen_verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" ADD CONSTRAINT "surat_kesediaan_requests_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" ADD CONSTRAINT "surat_kesediaan_requests_dosen_user_id_users_id_fk" FOREIGN KEY ("dosen_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" ADD CONSTRAINT "surat_kesediaan_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" ADD CONSTRAINT "surat_permohonan_requests_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" ADD CONSTRAINT "surat_permohonan_requests_dosen_user_id_users_id_fk" FOREIGN KEY ("dosen_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" ADD CONSTRAINT "surat_permohonan_requests_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" ADD CONSTRAINT "surat_permohonan_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_leader_id_users_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_dosen_kp_id_users_id_fk" FOREIGN KEY ("dosen_kp_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_response_letters_submission_id" ON "response_letters" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_response_letters_verified" ON "response_letters" USING btree ("verified");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_document_per_member" ON "submission_documents" USING btree ("submission_id","document_type","member_user_id");--> statement-breakpoint
CREATE INDEX "idx_submission_status" ON "submission_documents" USING btree ("submission_id","status");--> statement-breakpoint
CREATE INDEX "idx_status_updated" ON "submission_documents" USING btree ("status_updated_at");--> statement-breakpoint
CREATE INDEX "idx_submissions_workflow_stage" ON "submissions" USING btree ("workflow_stage");--> statement-breakpoint
CREATE INDEX "idx_submissions_admin_status" ON "submissions" USING btree ("admin_verification_status");--> statement-breakpoint
CREATE INDEX "idx_submissions_dosen_status" ON "submissions" USING btree ("dosen_verification_status");--> statement-breakpoint
CREATE INDEX "idx_submissions_dosen_queue" ON "submissions" USING btree ("workflow_stage","dosen_verified_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_letter_number_unique" ON "submissions" USING btree ("letter_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_surat_kesediaan_request" ON "surat_kesediaan_requests" USING btree ("member_user_id","dosen_user_id");--> statement-breakpoint
CREATE INDEX "idx_surat_kesediaan_dosen_status" ON "surat_kesediaan_requests" USING btree ("dosen_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_surat_kesediaan_member_status" ON "surat_kesediaan_requests" USING btree ("member_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_surat_kesediaan_created_at" ON "surat_kesediaan_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_permohonan_dosen" ON "surat_permohonan_requests" USING btree ("dosen_user_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "idx_surat_permohonan_requested_at" ON "surat_permohonan_requests" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "idx_surat_permohonan_member_dosen_status" ON "surat_permohonan_requests" USING btree ("member_user_id","dosen_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_templates_type" ON "templates" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_templates_is_active" ON "templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_templates_created_at" ON "templates" USING btree ("created_at");