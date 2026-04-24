ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "letter_number" varchar(100);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submissions_letter_number_unique" ON "submissions" ("letter_number");
