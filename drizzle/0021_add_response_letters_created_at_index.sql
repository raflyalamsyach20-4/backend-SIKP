-- Add index for created_at
CREATE INDEX IF NOT EXISTS "idx_response_letters_created_at" ON "response_letters" ("created_at");
