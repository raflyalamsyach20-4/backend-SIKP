DROP INDEX IF EXISTS "idx_surat_permohonan_dosen_status";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_permohonan_unique_pending"
	ON "surat_permohonan_requests" ("member_user_id", "dosen_user_id")
	WHERE "status" = 'MENUNGGU';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_permohonan_dosen" ON "surat_permohonan_requests" ("dosen_user_id","status","requested_at");