-- Migration: Add document_reviews column to submissions table
-- Date: 2026-02-11
-- Purpose: Store individual document review status (approved/rejected) per submission

-- Add documentReviews column as JSONB with default empty object
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS document_reviews JSONB DEFAULT '{}'::jsonb;

-- Create GIN index for better JSON query performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_submissions_document_reviews 
ON submissions USING GIN (document_reviews);

-- Add comment to explain the field
COMMENT ON COLUMN submissions.document_reviews IS 
'Stores individual document review status as JSON: {"doc-id": "approved"|"rejected"}. Used to display color indicators in review UI.';

-- Set default value for existing rows (if any have NULL)
UPDATE submissions 
SET document_reviews = '{}'::jsonb 
WHERE document_reviews IS NULL;
