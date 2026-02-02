-- Drop unnecessary columns from submissions table
-- Created: 2026-02-02
-- Purpose: Remove columns that are not in the schema

ALTER TABLE submissions DROP COLUMN IF EXISTS company_phone;
ALTER TABLE submissions DROP COLUMN IF EXISTS company_email;
ALTER TABLE submissions DROP COLUMN IF EXISTS company_supervisor;
ALTER TABLE submissions DROP COLUMN IF EXISTS position;
