DO $$ BEGIN
 CREATE TYPE "document_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
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
ALTER TYPE "document_type" ADD VALUE 'SURAT_PENGANTAR';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "response_letters" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"original_name" varchar(255),
	"file_name" varchar(255),
	"file_type" varchar(100),
	"file_size" bigint,
	"file_url" text,
	"member_user_id" text,
	"letter_status" "letter_status" NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"verified_by_admin_id" text
);
--> statement-breakpoint
ALTER TABLE "submission_documents" ADD COLUMN "status" "document_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_documents" ADD COLUMN "status_updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "document_reviews" json DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "status_history" json DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "response_letter_status" "response_letter_status" DEFAULT 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_response_letters_submission_id" ON "response_letters" ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_response_letters_verified" ON "response_letters" ("verified");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submission_status" ON "submission_documents" ("submission_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_status_updated" ON "submission_documents" ("status_updated_at");--> statement-breakpoint
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
 ALTER TABLE "response_letters" ADD CONSTRAINT "response_letters_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "response_letters" ADD CONSTRAINT "response_letters_verified_by_admin_id_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
