ALTER TABLE "mahasiswa" ADD COLUMN IF NOT EXISTS "esignature_url" text;--> statement-breakpoint
ALTER TABLE "mahasiswa" ADD COLUMN IF NOT EXISTS "esignature_key" varchar(255);--> statement-breakpoint
ALTER TABLE "mahasiswa" ADD COLUMN IF NOT EXISTS "esignature_uploaded_at" timestamp;--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" ADD COLUMN IF NOT EXISTS "rejection_reason" text;