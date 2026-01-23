-- Enable cascade deletion for team-related entities
-- 1) submissions.team_id -> teams.id ON DELETE CASCADE
ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_team_id_teams_id_fk";
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE;

-- 2) generated_letters.submission_id -> submissions.id ON DELETE CASCADE
ALTER TABLE "generated_letters" DROP CONSTRAINT IF EXISTS "generated_letters_submission_id_submissions_id_fk";
ALTER TABLE "generated_letters" ADD CONSTRAINT "generated_letters_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;
