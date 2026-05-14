-- Drop the old uploaded_by column completely
-- This should be done after column renamed to uploaded_by_user_id
ALTER TABLE "submission_documents" DROP COLUMN IF EXISTS "uploaded_by" CASCADE;
