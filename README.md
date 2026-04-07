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
- Auth: JWT + bcryptjs
- Validation: Zod

## Fitur Utama

- Autentikasi multi role: MAHASISWA, ADMIN, KAPRODI, WAKIL_DEKAN, DOSEN
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
JWT_SECRET=your-secret-key
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

Semua endpoint protected memakai header:

```text
Authorization: Bearer <token>
```

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

## Catatan Baseline Migration (2026-04-07)

- Histori migration lama telah diarsipkan ke folder [drizzle-archive-2026-04-07](drizzle-archive-2026-04-07).
- Baseline aktif saat ini adalah migration tunggal [drizzle/0000_fresh_migration.sql](drizzle/0000_fresh_migration.sql).
- Untuk environment dev/staging lama, lakukan reset schema `public` dan `drizzle` terlebih dahulu sebelum menjalankan baseline baru.
- Gunakan `bun run db:migrate` sebagai jalur utama sinkronisasi schema.

## Catatan

- Endpoint fallback kompatibilitas lama tetap ada di kode, namun endpoint utama didokumentasikan pada ringkasan backend.
- Untuk produksi, simpan secret dengan wrangler secret put.

## License

MIT
