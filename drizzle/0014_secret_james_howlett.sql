DO $$ BEGIN
 CREATE TYPE "letter_status" AS ENUM('approved', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "response_letter_status" AS ENUM('pending', 'submitted', 'verified');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Note: ALTER TYPE cannot be run in a prepared statement with Neon
-- Run this manually if needed: ALTER TYPE "document_type" ADD VALUE IF NOT EXISTS 'SURAT_PENGANTAR';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "response_letters" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"team_id" text NOT NULL,
	"file_path" varchar(500),
	"file_name" varchar(255),
	"file_size" bigint,
	"file_url" text,
	"letter_status" "letter_status" NOT NULL,
	"letter_status_description" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"verified_by_admin_id" text,
	"verification_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "approved_by" text;
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "document_reviews" json DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "status_history" json DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "response_letter_status" "response_letter_status" DEFAULT 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_response_letters_submission_id" ON "response_letters" ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_response_letters_team_id" ON "response_letters" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_response_letters_verified" ON "response_letters" ("verified");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_response_letters_created_at" ON "response_letters" ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "response_letters" ADD CONSTRAINT "response_letters_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "response_letters" ADD CONSTRAINT "response_letters_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "response_letters" ADD CONSTRAINT "response_letters_verified_by_admin_id_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
