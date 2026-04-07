-- Add index for team_id
CREATE INDEX IF NOT EXISTS "idx_response_letters_team_id" ON "response_letters" ("team_id");
