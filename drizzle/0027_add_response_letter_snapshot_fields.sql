-- Add snapshot fields and keep response_letters after submission deletion
ALTER TABLE "response_letters"
	DROP CONSTRAINT IF EXISTS "response_letters_submission_id_submissions_id_fk",
	ALTER COLUMN "submission_id" DROP NOT NULL,
	ADD CONSTRAINT "response_letters_submission_id_submissions_id_fk"
		FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL,
	ADD COLUMN "student_name" varchar(255),
	ADD COLUMN "student_nim" varchar(50),
	ADD COLUMN "company_name" varchar(255),
	ADD COLUMN "supervisor_name" varchar(255),
	ADD COLUMN "member_count" integer,
	ADD COLUMN "role_label" varchar(50),
	ADD COLUMN "members_snapshot" json;
