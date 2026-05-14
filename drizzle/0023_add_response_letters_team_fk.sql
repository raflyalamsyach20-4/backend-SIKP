-- Add foreign key for team_id
ALTER TABLE "response_letters" 
ADD CONSTRAINT IF NOT EXISTS "response_letters_team_id_teams_id_fk" 
FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade;
