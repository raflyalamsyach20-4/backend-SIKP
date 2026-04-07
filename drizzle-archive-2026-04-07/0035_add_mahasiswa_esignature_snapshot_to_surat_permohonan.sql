ALTER TABLE "surat_permohonan_requests"
ADD COLUMN IF NOT EXISTS "mahasiswa_esignature_url" text;

ALTER TABLE "surat_permohonan_requests"
ADD COLUMN IF NOT EXISTS "mahasiswa_esignature_snapshot_at" timestamp;
