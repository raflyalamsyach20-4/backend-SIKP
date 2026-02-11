-- Fix submission_documents schema: ensure uploaded_by_user_id is NOT NULL and remove uploaded_by
-- This migration cleans up the schema to match the new structure

-- Step 1: Ensure member_user_id dan uploaded_by_user_id are NOT NULL
-- First set default values for any NULL records
UPDATE "submission_documents"
  SET "member_user_id" = (
    SELECT "user_id" FROM "submissions" 
    WHERE "submissions"."id" = "submission_documents"."submission_id"
    LIMIT 1
  )
  WHERE "member_user_id" IS NULL;

UPDATE "submission_documents"
  SET "uploaded_by_user_id" = COALESCE("uploaded_by", (
    SELECT "user_id" FROM "submissions" 
    WHERE "submissions"."id" = "submission_documents"."submission_id"
    LIMIT 1
  ))
  WHERE "uploaded_by_user_id" IS NULL;

-- Step 2: Add NOT NULL constraint
ALTER TABLE "submission_documents"
  ALTER COLUMN "member_user_id" SET NOT NULL,
  ALTER COLUMN "uploaded_by_user_id" SET NOT NULL;

-- Step 3: Drop the old uploaded_by column
ALTER TABLE "submission_documents"
  DROP COLUMN IF EXISTS "uploaded_by" CASCADE;
