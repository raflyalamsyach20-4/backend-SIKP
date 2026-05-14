ALTER TABLE "surat_kesediaan_requests" DROP CONSTRAINT "surat_kesediaan_requests_submission_id_submissions_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_surat_kesediaan_request";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surat_kesediaan_member_status" ON "surat_kesediaan_requests" ("member_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_surat_kesediaan_request" ON "surat_kesediaan_requests" ("member_user_id","dosen_user_id");--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" DROP COLUMN IF EXISTS "submission_id";