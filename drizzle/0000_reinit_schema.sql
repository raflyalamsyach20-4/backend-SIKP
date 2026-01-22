CREATE TYPE "public"."document_type" AS ENUM('KTP', 'TRANSKRIP', 'KRS', 'PROPOSAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('DRAFT', 'MENUNGGU', 'DITOLAK', 'DITERIMA');--> statement-breakpoint
CREATE TYPE "public"."team_status" AS ENUM('PENDING', 'FIXED');--> statement-breakpoint
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
CREATE TABLE "submission_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"file_type" varchar(50) NOT NULL,
	"file_size" integer NOT NULL,
	"file_url" text NOT NULL,
	"document_type" "document_type" NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"company_address" text NOT NULL,
	"company_phone" varchar(50),
	"company_email" varchar(255),
	"company_supervisor" varchar(255),
	"position" varchar(255),
	"start_date" timestamp,
	"end_date" timestamp,
	"description" text,
	"status" "submission_status" DEFAULT 'DRAFT' NOT NULL,
	"rejection_reason" text,
	"approved_by" text,
	"approved_at" timestamp,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
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
	"status" "team_status" DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "teams_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "generated_letters" ADD CONSTRAINT "generated_letters_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_documents" ADD CONSTRAINT "submission_documents_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;