-- Add index for verified
CREATE INDEX IF NOT EXISTS "idx_response_letters_verified" ON "response_letters" ("verified");
