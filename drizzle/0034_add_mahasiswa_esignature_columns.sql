ALTER TABLE "mahasiswa" ADD COLUMN IF NOT EXISTS "esignature_url" text;
ALTER TABLE "mahasiswa" ADD COLUMN IF NOT EXISTS "esignature_key" varchar(255);
ALTER TABLE "mahasiswa" ADD COLUMN IF NOT EXISTS "esignature_uploaded_at" timestamp;
