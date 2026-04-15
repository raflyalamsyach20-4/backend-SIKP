# RINGKASAN BACKEND SIKP (KONDISI AKTUAL)

Dokumen ini merangkum kondisi backend yang benar-benar aktif saat ini berdasarkan implementasi route utama, middleware auth, service SSO, dan kontrak session yang sekarang dipakai frontend.

## 1. Status Arsitektur

- Runtime: Cloudflare Workers + Hono.
- Database: PostgreSQL (Neon) via Drizzle ORM.
- Storage file: Cloudflare R2.
- Auth aktif: SSO UNSRI (Authorization Code + PKCE) dengan session cookie.
- Session auth disimpan di tabel `auth_sessions`.
- Auth lokal lama (register/login JWT) masih ada sebagai endpoint kompatibilitas, tetapi dinonaktifkan (`410`).

## 2. Status Cutover SSO

Cutover autentikasi utama sudah selesai untuk alur inti login:

- login/register lokal tidak lagi menjadi jalur autentikasi SIKP,
- source of truth identitas user berasal dari SSO UNSRI,
- backend memulihkan identity dari endpoint profile/userinfo SSO,
- session browser berbasis cookie httpOnly,
- akun multi-identity wajib memilih identity aktif sebelum mengakses endpoint domain,
- akun yang hanya memiliki role SSO `user` atau `superadmin` ditolak mengakses SIKP.

Perubahan penting:
- fallback identity palsu ke `MAHASISWA` sudah dihapus,
- backend tidak lagi mengizinkan akun tanpa identity valid untuk lolos login,
- role blocking dilakukan terhadap kasus **blocked-only role set** (`USER`, `SUPERADMIN`) dari claim access token/profile.

## 3. Alur Auth dan Otorisasi

## 3.1 Alur Login SSO

1. Frontend memanggil `POST /api/auth/prepare` dengan PKCE challenge.
2. Backend membuat cookie verifikasi state `sikp_oauth_state` (httpOnly) dan mengembalikan authorize URL.
3. Browser diarahkan ke SSO provider.
4. Callback diproses di `POST /api/auth/callback` dengan `code`, `state`, dan `code_verifier`.
5. Backend:
   - menukar authorization code ke token SSO,
   - memverifikasi token JWT,
   - mengambil profile/identity dari SSO,
   - memetakan role dan identity internal,
   - menolak akun blocked-only (`user`/`superadmin`),
   - menyimpan session ke `auth_sessions`,
   - mengatur cookie session (default `sikp_session`).
6. Jika user memiliki lebih dari satu identity, user harus memilih identity aktif melalui `POST /api/auth/select-identity`.
7. Frontend menghidrasikan sesi melalui `GET /api/auth/me`.

## 3.2 Middleware

- `authMiddleware`:
  - membaca session dari cookie (atau Bearer fallback),
  - memvalidasi session melalui auth service,
  - menolak akses non-auth namespace jika identity aktif belum dipilih.
- `roleMiddleware`:
  - menggunakan `effectiveRoles` dari context auth.
- Shortcut middleware:
  - `mahasiswaOnly`
  - `adminOnly`
  - `dosenOnly`
  - `staffOnly`

## 3.3 Mapping Role Internal

Bucket identity efektif yang dipakai backend:
- `MAHASISWA`
- `ADMIN`
- `DOSEN`
- `MENTOR`

Role efektif yang bisa muncul di otorisasi:
- `MAHASISWA`
- `ADMIN`
- `DOSEN`
- `KAPRODI`
- `WAKIL_DEKAN`
- `MENTOR`

Aturan mapping penting:
- `MAHASISWA` -> bucket `MAHASISWA`
- `ADMIN` -> bucket `ADMIN`
- `DOSEN`, `KAPRODI`, `WAKIL_DEKAN` -> bucket `DOSEN`
- `MENTOR`, `PEMBIMBING_LAPANGAN` -> bucket `MENTOR`

## 3.4 Access Token vs Identity Payload

Claim access token yang dipakai backend sekarang diasumsikan berbentuk:
- `roles: string[]`
- `permissions: string[]`
- `scope: string[]`

Catatan:
- access token **tidak** menjadi sumber identity detail seperti `nim`, `nip`, `nidn`, `prodi`, `fakultas`, dll,
- detail identity diambil dari payload `/profile` / userinfo SSO,
- access token dipakai terutama untuk validasi authz source seperti role mentah dan permission/scope.

## 4. Payload Session dan Identity

## 4.1 Bentuk Identity Internal

Backend membentuk `AuthIdentity` dari data SSO dan menyimpan metadata identity secara kaya, termasuk bila tersedia:

- `identityType`
- `roleName`
- `identityId`
- `displayName`
- `identifier`
- `permissions`
- `metadata`

Metadata identity dapat membawa data mentah hasil normalisasi SSO seperti:
- `nim`
- `nip`
- `nidn`
- `phone` / `noTelepon`
- `instansi`
- `jabatan`
- `jabatanFungsional`
- `jabatanStruktural`
- `bidang`
- `bidangKeahlian`
- `angkatan`
- `semester`
- `semesterAktif`
- `jumlahSksLulus`
- `status`
- `prodi`, `fakultas`
- `dosenPA`
- `effectiveRoles`
- `profile`
- `roleMeta`

## 4.2 Payload `/api/auth/me`

Response `GET /api/auth/me` sekarang tidak lagi minimal. Selain `activeIdentity`, `availableIdentities`, `effectiveRoles`, dan `effectivePermissions`, payload `user` juga dapat membawa detail identity aktif/fallback yang sudah di-resolve, seperti:

- `id`
- `authUserId`
- `authProvider`
- `nama`
- `email`
- `role`
- `isActive`
- `nim`
- `nip`
- `nidn`
- `phone`
- `jabatan`
- `jabatanFungsional`
- `jabatanStruktural`
- `angkatan`
- `semester`
- `semesterAktif`
- `jumlahSksLulus`
- `prodi`
- `fakultas`

Ini dipakai frontend agar modul lama yang masih membaca detail akademik atau identitas dasar tidak kehilangan data setelah cutover SSO.

## 5. Endpoint yang Di-mount Saat Ini

## 5.1 Public

- `GET /`
- `GET /health`

## 5.2 Auth (`/api/auth`)

### Legacy, nonaktif (`410`)
- `POST /register/mahasiswa`
- `POST /register/admin`
- `POST /register/dosen`
- `POST /login`

### Aktif SSO
- `POST /prepare`
- `POST /callback`
- `GET /me` (auth)
- `GET /identities` (auth)
- `POST /select-identity` (auth)
- `POST /logout` (auth)

## 5.3 Team (`/api/teams`)

Route ini memakai `authMiddleware` + `mahasiswaOnly`, termasuk:
- create tim,
- join tim,
- invitation flow,
- finalize tim,
- leave/delete tim,
- reset tim.

## 5.4 Submission (`/api/submissions`)

Aktif untuk workflow submission KP:
- create/update/submit submission,
- upload/get/delete document,
- reset draft,
- my-submissions,
- detail by ID.

Endpoint detail submission diizinkan untuk role:
- `MAHASISWA`
- `ADMIN`
- `DOSEN`
- `KAPRODI`
- `WAKIL_DEKAN`

## 5.5 Template (`/api/templates`)

- Read: authenticated.
- Write (`POST`, `PUT`, `DELETE`, `PATCH /toggle-active`): `adminOnly`.

## 5.6 Response Letters (`/api/response-letters`)

- Semua endpoint melewati `authMiddleware`.
- Endpoint admin tetap diverifikasi lagi di level controller untuk role admin.

## 5.7 Surat Kesediaan & Surat Permohonan

Yang di-mount saat ini adalah fallback route global:

- `/api/surat-kesediaan/*`
- `/api/surat-permohonan/*`

Keduanya saat ini dibatasi `mahasiswaOnly`.

## 5.8 Utility & Assets

- `/api/utils/document-types`
- `/api/utils/document-types/all`
- `/api/assets/r2/*`

Catatan:
- asset R2 public read dibatasi key prefix tertentu sesuai implementasi asset route.

## 5.9 Profile SSO Proxy (`/api/profile`)

- `GET /manage-url` -> URL kelola profil di SSO.
- `GET /signature/manage-url` -> URL kelola signature di SSO.
- `GET /signature` -> baca signature aktif via proxy.
- `POST /signature`
- `POST /signature/:id/activate`
- `DELETE /signature/:id`

Operasi write signature di SIKP dinonaktifkan (`410`) dan diarahkan ke SSO.

## 5.10 Legacy Prefix Hard-Fail

Route berikut di-hard fail `410` oleh handler global:

- `/api/mahasiswa`
- `/api/mahasiswa/*`
- `/api/dosen`
- `/api/dosen/*`
- `/api/admin`
- `/api/admin/*`

## 6. Model Data Inti (Drizzle)

Schema aktif berfokus pada workflow KP dan session auth:

### Auth
- `auth_sessions`

### Workflow KP
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

## 7. Konfigurasi Environment Penting

### Wajib
- `DATABASE_URL`
- `JWT_SECRET` (legacy compatibility)
- `R2_BUCKET`
- `R2_DOMAIN`
- `R2_BUCKET_NAME`
- `SSO_BASE_URL`
- `SSO_ISSUER`
- `SSO_JWKS_URL`
- `SSO_CLIENT_ID`
- `SSO_CLIENT_SECRET`
- `SSO_REDIRECT_URI`
- `SSO_PROFILE_URL`
- `SSO_PROFILE_SIGNATURE_URL`

### Opsional / Override
- `SSO_TOKEN_URL`
- `SSO_USERINFO_URL`
- `SSO_IDENTITIES_URL`
- `SSO_REVOKE_URL`
- `AUTH_SESSION_TTL_SECONDS`
- `AUTH_COOKIE_SECURE`
- `AUTH_COOKIE_SAMESITE`
- `AUTH_SESSION_COOKIE_NAME`
- `SSO_SIGNATURE_PATH`
- `SSO_PROXY_TIMEOUT_MS`

## 8. Catatan Integrasi Saat Ini

- Route file lama seperti `admin.route.ts`, `dosen.route.ts`, `mahasiswa.route.ts`, dan route lama lain masih bisa ada di codebase, tetapi tidak otomatis berarti route tersebut aktif di entrypoint utama.
- Karena prefix legacy `mahasiswa/dosen/admin` di-hard fail, klien lama yang masih memanggil endpoint tersebut akan menerima `410`.
- Prefix `/api/mentor/*` belum menjadi bagian route aktif utama di entrypoint backend saat ini, sehingga request lama ke jalur itu berpotensi `404`.
- Backend auth inti sudah selaras dengan frontend untuk alur:
  - prepare,
  - callback,
  - me,
  - identity selection,
  - logout.
- Untuk smoke test lokal, backend harus berjalan dengan env lengkap, terutama:
  - `DATABASE_URL`
  - konfigurasi SSO
  - konfigurasi cookie/session

Tanpa itu, callback dan pemulihan session tidak akan berjalan benar.

## 9. Ringkasan Singkat

Backend sudah berada pada fase auth cutover SSO yang stabil untuk alur inti login dan session:

- SSO UNSRI menjadi satu-satunya jalur autentikasi aktif,
- session browser berbasis cookie + session repository,
- multi-identity selection sudah aktif,
- blocked-only role `user` / `superadmin` sudah ditolak,
- payload `/api/auth/me` sudah diperkaya dengan detail identity,
- domain workflow KP utama tetap aktif.

Pekerjaan lanjutan yang masih tersisa lebih banyak berada pada harmonisasi modul domain/endpoint lama yang belum sepenuhnya berpindah dari prefix legacy.