ALTER TABLE "admin" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dosen" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mahasiswa" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pembimbing_lapangan" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_active_identity_sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_identity_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "admin" CASCADE;--> statement-breakpoint
DROP TABLE "dosen" CASCADE;--> statement-breakpoint
DROP TABLE "mahasiswa" CASCADE;--> statement-breakpoint
DROP TABLE "pembimbing_lapangan" CASCADE;--> statement-breakpoint
DROP TABLE "user_active_identity_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "user_identity_cache" CASCADE;--> statement-breakpoint
DROP TABLE "users" CASCADE;--> statement-breakpoint
ALTER TABLE "generated_letters" DROP CONSTRAINT IF EXISTS "generated_letters_generated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "response_letters" DROP CONSTRAINT IF EXISTS "response_letters_member_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "response_letters" DROP CONSTRAINT IF EXISTS "response_letters_verified_by_admin_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "submission_documents" DROP CONSTRAINT IF EXISTS "submission_documents_member_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "submission_documents" DROP CONSTRAINT IF EXISTS "submission_documents_uploaded_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_admin_verified_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_dosen_verified_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" DROP CONSTRAINT IF EXISTS "surat_kesediaan_requests_member_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" DROP CONSTRAINT IF EXISTS "surat_kesediaan_requests_dosen_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "surat_kesediaan_requests" DROP CONSTRAINT IF EXISTS "surat_kesediaan_requests_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" DROP CONSTRAINT IF EXISTS "surat_permohonan_requests_member_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" DROP CONSTRAINT IF EXISTS "surat_permohonan_requests_dosen_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" DROP CONSTRAINT IF EXISTS "surat_permohonan_requests_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT IF EXISTS "team_members_invited_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_leader_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_dosen_kp_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "templates" DROP CONSTRAINT IF EXISTS "templates_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "templates" DROP CONSTRAINT IF EXISTS "templates_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" DROP COLUMN IF EXISTS "mahasiswa_esignature_url";--> statement-breakpoint
ALTER TABLE "surat_permohonan_requests" DROP COLUMN IF EXISTS "mahasiswa_esignature_snapshot_at";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."role";