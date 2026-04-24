-- Add index for submission_id
CREATE INDEX IF NOT EXISTS "idx_response_letters_submission_id" ON "response_letters" ("submission_id");
