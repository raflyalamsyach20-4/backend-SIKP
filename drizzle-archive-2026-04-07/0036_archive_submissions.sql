-- Migration: Add archived_at column to submissions table
-- Purpose: Allow "soft archiving" instead of hard deletion on team reset
--          so that admin/dosen history is preserved.
-- When a student clicks "Mulai Ulang" (restart), the submission is archived
-- (archived_at set to current timestamp) rather than deleted. The team status
-- is reset to PENDING so members can re-decide their team composition.

-- 1. Add archived_at timestamp column (NULL = active, non-null = archived)
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;

-- 2. Drop the DB-level unique constraint that prevents multiple submissions
--    per team (now handled at application layer: only one non-archived submission
--    per team is allowed at a time)
DROP INDEX IF EXISTS "uq_submission_per_team";
