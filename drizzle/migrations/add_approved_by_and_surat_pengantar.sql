-- Migration: Add approved_by column and SURAT_PENGANTAR document type
-- Date: 2026-02-07
-- Purpose: Support admin approval/rejection tracking and auto-generated cover letters

-- Step 1: Add SURAT_PENGANTAR to document_type enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'SURAT_PENGANTAR' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')
    ) THEN
        ALTER TYPE document_type ADD VALUE 'SURAT_PENGANTAR';
    END IF;
END $$;

-- Step 2: Add approved_by column to submissions table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'submissions' AND column_name = 'approved_by'
    ) THEN
        ALTER TABLE submissions ADD COLUMN approved_by TEXT NULL;
    END IF;
END $$;

-- Step 3: Add foreign key constraint to users table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_submission_approved_by'
    ) THEN
        ALTER TABLE submissions 
        ADD CONSTRAINT fk_submission_approved_by 
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Step 4: Add indexes for query performance
CREATE INDEX IF NOT EXISTS idx_submission_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submission_approved_by ON submissions(approved_by);

-- Verify migration
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'submissions' AND column_name = 'approved_by';
