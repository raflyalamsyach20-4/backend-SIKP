-- Update file_type column length from varchar(50) to varchar(100)
ALTER TABLE "submission_documents"
  ALTER COLUMN "file_type" SET DATA TYPE varchar(100);
