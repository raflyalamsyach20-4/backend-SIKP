-- Remove legacy profile columns from dosen table to match src/db/schema.ts
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "gelar_depan";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "gelar_belakang";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "bidang_keahlian";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "foto_profile";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "no_ruangan";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "jadwal_konsultasi";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "status_ketersediaan";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "tentang";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "penelitian";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "publikasi";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "profile_completed";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "esignature_url";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "profile_completed_at";
ALTER TABLE "dosen" DROP COLUMN IF EXISTS "last_login_at";
