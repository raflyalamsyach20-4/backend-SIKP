# Backend SIKP

Backend API untuk Sistem Informasi Kerja Praktik (SIKP) Manajemen Informatika UNSRI.

## Overview

Backend ini mengelola alur kerja praktik dari pembentukan tim, pengajuan surat, review admin, verifikasi dosen, sampai pelacakan surat balasan perusahaan.

## Tech Stack

- Runtime: Cloudflare Workers
- Framework: Hono
- Database: PostgreSQL (Neon)
- ORM: Drizzle ORM
- Storage: Cloudflare R2
- Auth: SSO UNSRI (OAuth Authorization Code + PKCE + JWKS)
- Validation: Zod

## Fitur Utama

- Autentikasi SSO UNSRI dengan multi-identity chooser
- Manajemen tim KP dan undangan anggota
- Submission workflow bertahap (draft, review admin, verifikasi dosen)
- Upload dan review dokumen submission
- Generate surat pengantar
- Verifikasi surat balasan perusahaan
- Manajemen template surat

## Struktur Singkat

```text
src/
  routes/         endpoint definitions
  controllers/    request handling dan response
  services/       business logic
  repositories/   akses database
  db/             schema dan util db
  middlewares/    auth dan role guards
  validation/     zod schemas
drizzle/          sql migrations
```

## Quick Start

1. Install dependency

```bash
bun install
```

2. Siapkan environment (lokal)

Buat file .dev.vars dengan nilai minimal:

```env
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
JWT_SECRET=legacy-secret
SSO_BASE_URL=https://sso.unsri.ac.id
SSO_ISSUER=https://sso.unsri.ac.id
SSO_JWKS_URL=https://sso.unsri.ac.id/.well-known/jwks.json
SSO_CLIENT_ID=your-client-id
SSO_CLIENT_SECRET=your-client-secret
SSO_REDIRECT_URI=https://your-frontend-domain/callback
AUTH_SESSION_TTL_SECONDS=43200
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAMESITE=Lax
AUTH_SESSION_COOKIE_NAME=sikp_session
SSO_SIGNATURE_PATH=/signature
SSO_PROXY_TIMEOUT_MS=10000
```

3. Siapkan database

```bash
bun run db:migrate
bun run db:seed
```

4. Jalankan development server

```bash
bun run dev
```

Server default: http://localhost:8787

## Scripts

```bash
bun run dev
bun run deploy
bun run db:generate
bun run db:push
bun run db:migrate
bun run db:seed
bun run db:status
bun run db:studio
bun run cf-typegen
```

## API Ringkas

Health:

- GET /
- GET /health

Base API:

- /api/auth
- /api/mahasiswa
- /api/teams
- /api/submissions
- /api/admin
- /api/dosen
- /api/templates
- /api/response-letters
- /api/utils
- /api/assets

Endpoint auth SSO utama:

- POST /api/auth/prepare
- POST /api/auth/callback
- GET /api/auth/identities
- POST /api/auth/select-identity
- GET /api/auth/me
- POST /api/auth/logout

Semua endpoint protected memakai session cookie `sikp_session` (httpOnly). Untuk kebutuhan non-browser, bisa kirim:

```text
Authorization: Bearer <sessionId>
```

Untuk frontend browser lintas origin, pastikan request API mengirim `credentials: 'include'` agar cookie session ikut terkirim.

## Response Format

Mayoritas endpoint mengembalikan:

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

## Dokumentasi Detail

Dokumentasi lengkap fitur, alur, endpoint, dan contoh payload tersedia di:

- [RINGKASAN_BACKEND_SIKP.md](RINGKASAN_BACKEND_SIKP.md)
- [docs-local/SMOKE_TEST_SSO.md](docs-local/SMOKE_TEST_SSO.md)

## Catatan Baseline Migration (2026-04-07)

- Histori migration lama telah diarsipkan ke folder [drizzle-archive-2026-04-07](drizzle-archive-2026-04-07).
- Baseline aktif saat ini adalah migration tunggal [drizzle/0000_fresh_migration.sql](drizzle/0000_fresh_migration.sql).
- Untuk environment dev/staging lama, lakukan reset schema `public` dan `drizzle` terlebih dahulu sebelum menjalankan baseline baru.
- Gunakan `bun run db:migrate` sebagai jalur utama sinkronisasi schema.

## Catatan

- Endpoint login/register lokal tetap ada untuk kompatibilitas tetapi sudah di-hard-fail (HTTP 410).
- Untuk produksi, simpan secret dengan wrangler secret put.

## License

MIT
