ALTER TABLE "generated_letters" RENAME COLUMN "generated_by" TO "generated_by_admin_id";--> statement-breakpoint
ALTER TABLE "response_letters" RENAME COLUMN "member_user_id" TO "member_mahasiswa_id";--> statement-breakpoint
ALTER TABLE "submission_documents" RENAME COLUMN "member_user_id" TO "member_mahasiswa_id";--> statement-breakpoint
ALTER TABLE "submission_documents" RENAME COLUMN "uploaded_by_user_id" TO "uploaded_by_mahasiswa_id";--> statement-breakpoint
ALTER TABLE "submissions" RENAME COLUMN "approved_by" TO "approved_by_admin_id";--> statement-breakpoint
ALTER TABLE "submissions" RENAME COLUMN "admin_verified_by" TO "admin_verified_by_admin_id";--> statement-breakpoint
ALTER TABLE "submissions" RENAME COLUMN "dosen_verified_by" TO "dosen_verified_by_dosen_id";--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" RENAME COLUMN "member_user_id" TO "member_mahasiswa_id";--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" RENAME COLUMN "dosen_user_id" TO "dosen_id";--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" RENAME COLUMN "approved_by" TO "approved_by_dosen_id";--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" RENAME COLUMN "member_user_id" TO "member_mahasiswa_id";--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" RENAME COLUMN "dosen_user_id" TO "dosen_id";--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" RENAME COLUMN "approved_by" TO "approved_by_dosen_id";--> statement-breakpoint
ALTER TABLE "team_members" RENAME COLUMN "user_id" TO "mahasiswa_id";--> statement-breakpoint
ALTER TABLE "team_members" RENAME COLUMN "invited_by" TO "invited_by_mahasiswa_id";--> statement-breakpoint
ALTER TABLE "teams" RENAME COLUMN "leader_id" TO "leader_mahasiswa_id";--> statement-breakpoint
ALTER TABLE "templates" RENAME COLUMN "created_by" TO "created_by_admin_id";--> statement-breakpoint
ALTER TABLE "templates" RENAME COLUMN "updated_by" TO "updated_by_admin_id";--> statement-breakpoint
DROP INDEX "uq_document_per_member";--> statement-breakpoint
DROP INDEX "idx_submissions_dosen_queue";--> statement-breakpoint
DROP INDEX "uq_surat_kesediaan_request";--> statement-breakpoint
DROP INDEX "idx_surat_kesediaan_dosen_status";--> statement-breakpoint
DROP INDEX "idx_surat_kesediaan_member_status";--> statement-breakpoint
DROP INDEX "idx_permohonan_dosen";--> statement-breakpoint
DROP INDEX "idx_surat_permohonan_member_dosen_status";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_document_per_member" ON "submission_documents" USING btree ("submission_id","document_type","member_mahasiswa_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_dosen_queue" ON "submissions" USING btree ("workflow_stage","dosen_verified_by_dosen_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_surat_kesediaan_request" ON "surat_kesediaan_requests" USING btree ("member_mahasiswa_id","dosen_id");--> statement-breakpoint
CREATE INDEX "idx_surat_kesediaan_dosen_status" ON "surat_kesediaan_requests" USING btree ("dosen_id","status");--> statement-breakpoint
CREATE INDEX "idx_surat_kesediaan_member_status" ON "surat_kesediaan_requests" USING btree ("member_mahasiswa_id","status");--> statement-breakpoint
CREATE INDEX "idx_permohonan_dosen" ON "surat_permohonan_requests" USING btree ("dosen_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "idx_surat_permohonan_member_dosen_status" ON "surat_permohonan_requests" USING btree ("member_mahasiswa_id","dosen_id","status");