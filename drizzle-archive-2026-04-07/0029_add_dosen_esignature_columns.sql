-- Add e-signature metadata columns to dosen for persistent Cloudflare R2 storage
ALTER TABLE "dosen"
ADD COLUMN IF NOT EXISTS "esignature_url" text,
ADD COLUMN IF NOT EXISTS "esignature_key" varchar(255),
ADD COLUMN IF NOT EXISTS "esignature_uploaded_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_dosen_esignature_uploaded_at"
  ON "dosen" ("esignature_uploaded_at");
