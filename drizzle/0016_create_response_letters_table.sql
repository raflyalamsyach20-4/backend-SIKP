-- Create response_letters table
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
