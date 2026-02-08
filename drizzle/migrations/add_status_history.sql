-- Migration: Add status_history column to submissions table
-- Add JSON array to track all status transitions

ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_submissions_status_history ON submissions USING gin(status_history);

-- Optional: Initialize existing records with history
-- For existing submissions, create history entries based on current state
UPDATE submissions
SET status_history = CASE 
  WHEN status = 'APPROVED' THEN 
    jsonb_build_array(
      jsonb_build_object('status', 'PENDING_REVIEW', 'date', submitted_at),
      jsonb_build_object('status', 'APPROVED', 'date', approved_at)
    )
  WHEN status = 'REJECTED' THEN 
    jsonb_build_array(
      jsonb_build_object('status', 'PENDING_REVIEW', 'date', submitted_at),
      jsonb_build_object('status', 'REJECTED', 'date', updated_at, 'reason', rejection_reason)
    )
  WHEN status = 'PENDING_REVIEW' THEN 
    jsonb_build_array(
      jsonb_build_object('status', 'PENDING_REVIEW', 'date', submitted_at)
    )
  ELSE 
    jsonb_build_array(
      jsonb_build_object('status', 'DRAFT', 'date', created_at)
    )
END
WHERE status_history = '[]'::jsonb;

-- Verify
SELECT COUNT(*) as "submissions_updated" FROM submissions WHERE status_history != '[]'::jsonb;
