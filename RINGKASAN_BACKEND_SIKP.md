# RINGKASAN BACKEND SIKP (KONDISI AKTUAL)

Dokumen ini merangkum kondisi backend yang benar-benar aktif saat ini berdasarkan implementasi di `src/index.ts`, route yang di-mount, middleware auth, service SSO, dan schema Drizzle.

## 1. Status Arsitektur

- Runtime: Cloudflare Workers + Hono.
- Database: PostgreSQL (Neon) via Drizzle ORM.
- Storage file: Cloudflare R2.
- Auth aktif: SSO UNSRI (Authorization Code + PKCE) dengan session cookie.
- Auth lokal (register/login JWT lama): dipertahankan sebagai endpoint kompatibilitas, tetapi dinonaktifkan (`410`).

## 2. Perubahan Kunci (Big-Bang SSO)

- Source of truth identitas user dipindah ke SSO; backend tidak lagi mengandalkan tabel profile lokal per role sebagai basis auth.
- Session disimpan di tabel minimal `auth_sessions`.
- Endpoint prefix legacy berikut di-hard fail `410`:
  - `/api/mahasiswa`
  - `/api/dosen`
  - `/api/admin`
- Akses endpoint non-auth mewajibkan identity aktif. Jika user belum memilih identity, request ditolak `403`.

## 3. Alur Auth dan Otorisasi

## 3.1 Alur Login SSO

1. Frontend memanggil `POST /api/auth/prepare` dengan PKCE challenge.
2. Backend set cookie `sikp_oauth_state` (httpOnly) dan mengembalikan authorize URL.
3. Frontend redirect ke SSO provider.
4. Callback diproses di `POST /api/auth/callback` (code + state + code_verifier).
5. Backend tukar code ke token SSO, ambil profile/identities, simpan session ke `auth_sessions`, set cookie session (default `sikp_session`).
6. Jika multi-identity, user wajib pilih identity (`/api/auth/select-identity`) sebelum mengakses endpoint domain.

## 3.2 Middleware

- `authMiddleware`:
  - membaca session dari cookie (atau Bearer fallback),
  - memvalidasi session via `authService.authenticateSession`,
  - menolak akses non-auth namespace jika identity aktif belum dipilih.
- `roleMiddleware`:
  - memakai `effectiveRoles` dari context auth.
- Shortcut middleware:
  - `mahasiswaOnly`, `adminOnly`, `dosenOnly`, `staffOnly`.

## 3.3 Mapping Role

Role efektif yang dipakai backend:
- `MAHASISWA`
- `ADMIN`
- `KAPRODI`
- `WAKIL_DEKAN`
- `DOSEN`
- `MENTOR` (alias dari input SSO `MENTOR`/`PEMBIMBING_LAPANGAN`)

## 4. Endpoint yang Di-mount Saat Ini

## 4.1 Public

- `GET /`
- `GET /health`

## 4.2 Auth (`/api/auth`)

- Legacy, nonaktif (`410`):
  - `POST /register/mahasiswa`
  - `POST /register/admin`
  - `POST /register/dosen`
  - `POST /login`
- Aktif SSO:
  - `POST /prepare`
  - `POST /callback`
  - `GET /me` (auth)
  - `GET /identities` (auth)
  - `POST /select-identity` (auth)
  - `POST /logout` (auth)

## 4.3 Team (`/api/teams`)

Semua endpoint di route ini memakai `authMiddleware` + `mahasiswaOnly`:
- create/join/finalize/leave/delete tim,
- invitation flow,
- reset tim (`POST /api/teams/reset`).

## 4.4 Submission (`/api/submissions`)

- Mahasiswa: create, update, submit, upload/get/delete document, reset draft, my-submissions.
- Detail by ID (`GET /:submissionId`) diizinkan untuk role: `MAHASISWA`, `ADMIN`, `KAPRODI`, `WAKIL_DEKAN`, `DOSEN`.
- Tidak ada mount `/api/admin/*` pada entrypoint utama.

## 4.5 Template (`/api/templates`)

- Read: auth.
- Write (`POST`, `PUT`, `DELETE`, `PATCH /toggle-active`): `adminOnly`.

## 4.6 Response Letters (`/api/response-letters`)

- Semua endpoint route ini melewati `authMiddleware`.
- Endpoint admin (`/admin`, `/admin/:id/verify`, `/admin/:id`) tetap divalidasi lagi di level controller (role admin).

## 4.7 Surat Kesediaan & Surat Permohonan

Yang di-mount saat ini adalah fallback global:
- `/api/surat-kesediaan/*`
- `/api/surat-permohonan/*`

Keduanya saat ini dibatasi `mahasiswaOnly` di route fallback.

## 4.8 Utility & Assets

- `/api/utils/document-types`
- `/api/utils/document-types/all`
- `/api/assets/r2/*` (public read, dibatasi key prefix `esignatures/`)

## 4.9 Profile SSO Proxy (`/api/profile`)

- `GET /manage-url` -> URL kelola profil di SSO.
- `GET /signature/manage-url` -> URL kelola signature di SSO.
- `GET /signature` -> baca signature aktif via proxy.
- `POST /signature`, `POST /signature/:id/activate`, `DELETE /signature/:id` -> nonaktif (`410`), write signature wajib melalui SSO.

## 4.10 Legacy Prefix Hard-Fail

Route berikut selalu `410` oleh handler global di `index.ts`:
- `/api/mahasiswa`
- `/api/mahasiswa/*`
- `/api/dosen`
- `/api/dosen/*`
- `/api/admin`
- `/api/admin/*`

## 5. Model Data Inti (Drizzle)

Schema aktif di `src/db/schema.ts` berfokus pada domain workflow KP dan session auth:

- Auth:
  - `auth_sessions`
- Workflow KP:
  - `teams`
  - `team_members`
  - `submissions`
  - `submission_documents`
  - `generated_letters`
  - `templates`
  - `response_letters`
  - `surat_kesediaan_requests`
  - `surat_permohonan_requests`

Enum penting:
- `workflow_stage`: `DRAFT`, `PENDING_ADMIN_REVIEW`, `PENDING_DOSEN_VERIFICATION`, `COMPLETED`, `REJECTED_ADMIN`, `REJECTED_DOSEN`
- `submission_status`: `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`
- `submission_verification_status`: `PENDING`, `APPROVED`, `REJECTED`
- enum dokumen/surat sesuai definisi di schema.

## 6. Konfigurasi Environment Penting

Wajib tersedia:
- `DATABASE_URL`
- `JWT_SECRET` (legacy compatibility)
- `R2_BUCKET`, `R2_DOMAIN`, `R2_BUCKET_NAME`
- `SSO_BASE_URL`, `SSO_ISSUER`, `SSO_JWKS_URL`
- `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_REDIRECT_URI`
- `SSO_PROFILE_URL`, `SSO_PROFILE_SIGNATURE_URL`

Opsional:
- `SSO_TOKEN_URL`, `SSO_USERINFO_URL`, `SSO_IDENTITIES_URL`, `SSO_REVOKE_URL`
- `AUTH_SESSION_TTL_SECONDS`, `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE`, `AUTH_SESSION_COOKIE_NAME`
- `SSO_SIGNATURE_PATH`, `SSO_PROXY_TIMEOUT_MS`

## 7. Catatan Integrasi Saat Ini

- Route file lama seperti `admin.route.ts`, `dosen.route.ts`, `mahasiswa.route.ts`, dan route dosen-surat khusus masih ada di codebase, tetapi tidak di-mount pada `src/index.ts`.
- Karena hard-fail legacy prefix, klien yang masih memanggil `/api/mahasiswa/*`, `/api/dosen/*`, atau `/api/admin/*` akan menerima `410`.
- Prefix `/api/mentor/*` juga belum di-mount pada entrypoint saat ini, sehingga request lama ke jalur mentor berpotensi `404`.
- Untuk smoke test lokal, pastikan backend berjalan dengan env lengkap terutama `DATABASE_URL`; tanpa itu auth/callback akan gagal saat akses session repository.

## 8. Ringkasan Singkat

Backend sudah berada di mode SSO cutover: auth berbasis session cookie + identity selection, domain workflow KP tetap aktif, dan route identity lama diputus tegas via `410`.