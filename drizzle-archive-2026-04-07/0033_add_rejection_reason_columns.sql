ALTER TABLE "surat_kesediaan_requests" ADD COLUMN IF NOT EXISTS "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" ADD COLUMN IF NOT EXISTS "rejection_reason" text;
