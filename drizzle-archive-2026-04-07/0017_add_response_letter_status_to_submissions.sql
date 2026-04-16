-- Add response_letter_status column to submissions table
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "response_letter_status" "response_letter_status" DEFAULT 'pending';
