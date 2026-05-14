-- Add foreign key for submission_id
ALTER TABLE "response_letters" 
ADD CONSTRAINT IF NOT EXISTS "response_letters_submission_id_submissions_id_fk" 
FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE cascade;
