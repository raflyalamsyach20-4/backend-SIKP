-- Manual fix to add missing file storage columns across assessment tables
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "file_name" varchar(255);
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "file_url" text;
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "file_type" varchar(100);
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "file_size" integer;
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "original_name" varchar(255);

ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "file_name" varchar(255);
ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "file_url" text;
ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "file_type" varchar(100);
ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "file_size" integer;
ALTER TABLE "lecturer_assessments" ADD COLUMN IF NOT EXISTS "original_name" varchar(255);

ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "file_name" varchar(255);
ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "file_url" text;
ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "file_type" varchar(100);
ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "file_size" integer;
ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "original_name" varchar(255);
ALTER TABLE "combined_grades" ADD COLUMN IF NOT EXISTS "pdf_generated" boolean DEFAULT false NOT NULL;
