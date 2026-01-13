# AGENT.md

## 1. Tujuan Dokumen

Dokumen **AGENT.md** berfungsi sebagai panduan teknis dan operasional untuk pengembangan **Backend Aplikasi Kerja Praktik Universitas**. Dokumen ini ditujukan untuk developer (individu maupun tim) agar memiliki pemahaman yang konsisten terkait arsitektur, teknologi, konvensi, dan alur kerja backend.

Backend dibangun dengan pendekatan **API-first**, terpisah dari frontend, dan dirancang untuk berjalan di lingkungan **Cloudflare (edge/serverless)**.

---

## 2. Gambaran Umum Backend

Backend bertanggung jawab untuk:

* Autentikasi & otorisasi pengguna (Mahasiswa & Admin)
* Manajemen tim kerja praktik
* Proses pengajuan kerja praktik (step-by-step)
* Validasi dokumen & data pengajuan
* Manajemen status pengajuan
* Generate surat pengantar kerja praktik
* Penyimpanan & pengambilan dokumen

Backend **tidak menangani UI**, seluruh komunikasi dilakukan melalui REST API.

---

## 3. Tech Stack

### 3.1 Runtime & Framework

* **Bun** – runtime JavaScript/TypeScript utama
* **Hono** – web framework ringan untuk API
* **Cloudflare Workers** – deployment target (edge)

### 3.2 Database

* **Neon DB (PostgreSQL)** – database serverless
* **Drizzle ORM** – ORM type-safe untuk PostgreSQL

### 3.3 Storage

* **Cloudflare R2** – penyimpanan file (dokumen pengajuan & surat pengantar)

### 3.4 Authentication

* **Auth bawaan Hono**
* Berbasis session / JWT (disesuaikan implementasi)

---

## 4. Prinsip Arsitektur

Backend mengikuti prinsip berikut:

1. **Separation of Concerns**

   * Route hanya menangani request/response
   * Logic bisnis berada di layer service
   * Akses database terisolasi di layer repository

2. **Stateless API**

   * Tidak menyimpan state di server
   * Semua state penting disimpan di database

3. **Role-Based Access Control (RBAC)**

   * Role utama: `MAHASISWA`, `ADMIN`
   * Setiap endpoint memiliki pembatasan role

4. **Type Safety**

   * TypeScript di seluruh backend
   * Drizzle schema sebagai single source of truth

---

## 5. Struktur Direktori (Rekomendasi)

```
backend/
├── src/
│   ├── app.ts                # Entry point Hono
│   ├── routes/               # Definisi endpoint
│   │   ├── auth.route.ts
│   │   ├── team.route.ts
│   │   ├── submission.route.ts
│   │   ├── admin.route.ts
│   ├── controllers/          # Handler request
│   ├── services/             # Business logic
│   ├── repositories/         # Query database
│   ├── middlewares/          # Auth & role guard
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema
│   │   ├── index.ts          # DB connection
│   ├── utils/                # Helper (date, file, etc)
│   └── types/                # Custom types
├── drizzle/                  # Migration files
├── .env
├── bun.lockb
└── tsconfig.json
```

---

## 6. Authentication & Authorization

### 6.1 Authentication

* Autentikasi dilakukan melalui endpoint `/auth`
* Setelah login, user mendapatkan session atau token
* Token dikirim melalui:

  * Authorization Header, atau
  * HTTP-only cookie

### 6.2 Authorization

* Middleware `authMiddleware` memverifikasi user
* Middleware `roleMiddleware` memverifikasi role

Contoh role check:

* `/mahasiswa/*` → MAHASISWA
* `/admin/*` → ADMIN

---

## 7. Alur Bisnis Utama

### 7.1 Pembentukan Tim

1. Mahasiswa membuat tim
2. Undang anggota (berdasarkan NIM)
3. Anggota menerima / menolak undangan
4. Tim berstatus **FIX** jika seluruh anggota menerima

### 7.2 Pengajuan Kerja Praktik

1. Tim FIX dapat membuat pengajuan
2. Mahasiswa:

   * Mengisi data instansi
   * Upload dokumen persyaratan
3. Validasi data & dokumen
4. Submit → status `MENUNGGU`

### 7.3 Proses Admin

* Admin melihat daftar pengajuan
* Admin dapat:

  * Menolak → status `DITOLAK`
  * Menyetujui → status `DITERIMA`

### 7.4 Generate Surat Pengantar

* Saat pengajuan disetujui:

  * Sistem generate surat dari template
  * Data diambil dari pengajuan
  * Output: PDF / DOCX
* Surat disimpan di Cloudflare R2
* URL surat disimpan di database

---

## 8. Manajemen Status Pengajuan

Status yang digunakan:

* `DRAFT`
* `MENUNGGU`
* `DITOLAK`
* `DITERIMA`

Catatan:

* Pengajuan yang ditolak **tidak dihapus**
* Mahasiswa dapat membuat pengajuan baru
* Riwayat pengajuan tetap tersimpan

---

## 9. Upload & Storage Dokumen

* Semua file disimpan di **Cloudflare R2**
* Database hanya menyimpan metadata file:

  * nama file
  * tipe
  * ukuran
  * URL

Aturan:

* Validasi tipe file (PDF, DOCX)
* Batas ukuran file
* Nama file di-generate unik

---

## 10. Error Handling & Response

Format response standar:

```
{
  "success": boolean,
  "message": string,
  "data": any | null
}
```

* Gunakan HTTP status code yang sesuai
* Error internal tidak menampilkan detail sensitif

---

## 11. Keamanan

* Validasi input di semua endpoint
* Middleware auth wajib untuk endpoint sensitif
* Role guard untuk endpoint admin
* File tidak dapat diakses tanpa izin

---

## 12. Catatan Pengembangan

* Gunakan migration Drizzle untuk perubahan schema
* Hindari query mentah jika tidak diperlukan
* Jaga konsistensi penamaan (snake_case di DB, camelCase di code)
* Dokumentasikan endpoint penting

---

## 13. Checklist / To-Do Pengembangan Backend (Untuk AI & Developer)

Bagian ini berfungsi sebagai **checklist eksekusi** yang harus diikuti secara berurutan agar backend aplikasi dapat dibangun dengan benar dan konsisten.

### 13.1 Setup Awal

* [ ] Inisialisasi project menggunakan **Bun**
* [ ] Install dependency utama (Hono, Drizzle, dotenv, dll)
* [ ] Konfigurasi TypeScript
* [ ] Setup environment variable (`.env`)
* [ ] Konfigurasi Cloudflare Worker

---

### 13.2 Database & ORM

* [ ] Mendesain ERD sesuai kebutuhan bisnis
* [ ] Membuat Drizzle schema:

  * [ ] users
  * [ ] roles
  * [ ] teams
  * [ ] team_members
  * [ ] invitations
  * [ ] submissions
  * [ ] submission_documents
  * [ ] generated_letters
* [ ] Setup koneksi Neon DB
* [ ] Menjalankan migration Drizzle

---

### 13.3 Authentication & Authorization

* [ ] Implementasi auth bawaan Hono
* [ ] Endpoint login & logout
* [ ] Middleware autentikasi
* [ ] Middleware role-based access (MAHASISWA / ADMIN)
* [ ] Proteksi endpoint sensitif

---

### 13.4 Fitur Mahasiswa

#### Pembentukan Tim

* [ ] Endpoint buat tim
* [ ] Endpoint undang anggota (by NIM)
* [ ] Endpoint terima / tolak undangan
* [ ] Validasi status tim (FIX)

#### Pengajuan Kerja Praktik

* [ ] Endpoint create draft pengajuan
* [ ] Endpoint update data instansi
* [ ] Endpoint upload dokumen
* [ ] Validasi kelengkapan data
* [ ] Endpoint submit pengajuan

---

### 13.5 Fitur Admin

* [ ] Endpoint list pengajuan
* [ ] Endpoint detail pengajuan
* [ ] Endpoint tolak pengajuan
* [ ] Endpoint setujui pengajuan

---

### 13.6 Generate Surat Pengantar

* [ ] Menyiapkan template surat
* [ ] Mapping data pengajuan ke template
* [ ] Generate surat (PDF/DOCX)
* [ ] Upload surat ke Cloudflare R2
* [ ] Simpan metadata surat ke database

---

### 13.7 Storage & File Handling

* [ ] Integrasi Cloudflare R2
* [ ] Validasi tipe & ukuran file
* [ ] Penamaan file unik
* [ ] Pengamanan akses file

---

### 13.8 Error Handling & Response

* [ ] Response format konsisten
* [ ] Centralized error handler
* [ ] Logging error penting

---

### 13.9 Testing & Validasi

* [ ] Test endpoint auth
* [ ] Test flow tim
* [ ] Test flow pengajuan
* [ ] Test approve/reject admin
* [ ] Test generate surat

---

## 14. Langkah Kerja AI dalam Membangun Aplikasi

Bagian ini menjelaskan **urutan kerja AI** (atau developer) saat membangun backend aplikasi berdasarkan dokumen ini.

### Step 1 – Memahami Domain

AI harus:

* Memahami alur kerja praktik kampus
* Mengidentifikasi role (Mahasiswa & Admin)
* Memahami status pengajuan

---

### Step 2 – Mendesain Data

AI harus:

* Menyusun ERD
* Menentukan relasi antar tabel
* Menentukan field penting & constraint

---

### Step 3 – Menyusun Arsitektur

AI harus:

* Membuat struktur folder
* Menentukan layer (route, controller, service, repository)
* Menentukan middleware yang dibutuhkan

---

### Step 4 – Implementasi Dasar

AI harus:

* Menginisialisasi server Hono
* Setup koneksi database
* Setup auth & middleware

---

### Step 5 – Implementasi Fitur Inti

AI harus mengimplementasikan secara berurutan:

1. Authentication
2. Pembentukan tim
3. Pengajuan kerja praktik
4. Proses admin
5. Generate surat

---

### Step 6 – Integrasi Storage

AI harus:

* Menghubungkan Cloudflare R2
* Menangani upload & download file
* Menjaga keamanan akses

---

### Step 7 – Validasi & Keamanan

AI harus:

* Menambahkan validasi input
* Menambahkan role guard
* Menangani error dengan aman

---

### Step 8 – Testing & Finalisasi

AI harus:

* Menguji seluruh flow utama
* Memastikan tidak ada endpoint bocor
* Memastikan data konsisten

---

## 15. Penutup

AGENT.md ini berfungsi sebagai **blueprint teknis sekaligus panduan eksekusi**. Seluruh checklist dan langkah kerja di atas harus diikuti agar backend aplikasi kerja praktik dapat dibangun secara sistematis, aman, dan sesuai kebutuhan bisnis.

Setiap perubahan besar pada sistem **wajib diikuti dengan pembaruan dokumen ini** untuk menjaga konsistensi dan kualitas pengembangan.
