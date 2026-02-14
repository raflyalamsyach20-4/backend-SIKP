# Backend SIKP - Sistem Informasi Kerja Praktik

Backend API untuk aplikasi Kerja Praktik Universitas, dibangun dengan Hono dan Cloudflare Workers.

## 📌 Aturan Wajib Sinkronisasi Dokumentasi

Setiap kali ada perubahan kode backend (endpoint, request/response, validasi, auth flow, business logic), **WAJIB** lakukan update berikut dalam commit/PR yang sama:

1. `RINGKASAN_BACKEND_SIKP.md`
2. `postman/postman_collection_sso.json`

Checklist ini bersifat mandatory agar dokumentasi dan koleksi testing selalu sesuai implementasi terbaru.

## 📋 Tech Stack

- **Runtime**: Cloudflare Workers (Edge Computing)
- **Framework**: Hono (Lightweight Web Framework)
- **Database**: Neon DB (Serverless PostgreSQL)
- **ORM**: Drizzle ORM (Type-safe)
- **Storage**: Cloudflare R2 (Object Storage)
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Zod (Schema Validation)

## ✨ Fitur Utama

- ✅ **Autentikasi & Otorisasi** - JWT-based dengan role MAHASISWA/ADMIN
- ✅ **Manajemen Tim** - Pembentukan tim kerja praktik
- ✅ **Sistem Undangan** - Undang anggota berdasarkan NIM
- ✅ **Pengajuan KP** - Proses step-by-step dengan validasi
- ✅ **Upload Dokumen** - Validasi tipe & ukuran file
- ✅ **Review & Approval** - Admin dapat approve/reject
- ✅ **Generate Surat** - Otomatis generate surat pengantar (PDF/DOCX)
- ✅ **Statistics** - Dashboard statistik pengajuan

## 🏗️ Struktur Project

```
backend-SIKP/
├── src/
│   ├── index.ts                  # Entry point aplikasi
│   ├── controllers/              # Request handlers
│   │   ├── auth.controller.ts
│   │   ├── team.controller.ts
│   │   ├── submission.controller.ts
│   │   └── admin.controller.ts
│   ├── services/                 # Business logic
│   │   ├── auth.service.ts
│   │   ├── team.service.ts
│   │   ├── submission.service.ts
│   │   ├── admin.service.ts
│   │   ├── storage.service.ts
│   │   └── letter.service.ts
│   ├── repositories/             # Database queries
│   │   ├── user.repository.ts
│   │   ├── team.repository.ts
│   │   └── submission.repository.ts
│   ├── routes/                   # Route definitions
│   │   ├── auth.route.ts
│   │   ├── team.route.ts
│   │   ├── submission.route.ts
│   │   └── admin.route.ts
│   ├── middlewares/              # Auth & role guards
│   │   └── auth.middleware.ts
│   ├── db/                       # Database
│   │   ├── schema.ts             # Drizzle schema
│   │   └── index.ts              # DB connection
│   ├── types/                    # TypeScript types
│   │   └── index.ts
│   └── utils/                    # Helper functions
│       └── helpers.ts
├── drizzle/                      # Migration files
├── .dev.vars                     # Development variables
├── package.json
├── tsconfig.json
├── wrangler.jsonc                # Cloudflare config
└── drizzle.config.ts             # Drizzle config
```

## 🚀 Setup & Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment Variables

Edit `.dev.vars` untuk development:

```
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
JWT_SECRET=your-secret-key-here
```

Untuk production, gunakan `wrangler secret`:

```bash
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
```

### 3. Setup Database

**Generate & Apply Migration:**
```bash
npm run db:generate   # Generate migration files
npm run db:push       # Apply to database
```

**Seed Initial Data:**
```bash
npm run db:seed       # Create admin & sample users
```

**Verify Database:**
```bash
npm run db:status     # Check tables & records
npm run db:studio     # Open Drizzle Studio GUI
```

**📚 See:** [Database Migration Guide](DATABASE_MIGRATION_GUIDE.md) for complete documentation.

Push schema ke database:
```bash
npm run db:push
```

Atau jalankan migration:
```bash
npm run db:migrate
```

### 4. Development

Run development server:
```bash
npm run dev
```

API akan berjalan di `http://localhost:8787`

### 5. Deploy ke Cloudflare

```bash
npm run deploy
```

## 📚 API Endpoints

### 🔐 Authentication

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/api/auth/register` | - | - | Register user baru |
| POST | `/api/auth/login` | - | - | Login dan dapatkan token |
| GET | `/api/auth/me` | ✅ | - | Get user info |

### 👥 Teams (Mahasiswa)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/api/teams` | ✅ | MAHASISWA | Buat tim baru |
| GET | `/api/teams/my-teams` | ✅ | MAHASISWA | Get tim saya |
| POST | `/api/teams/:teamId/invite` | ✅ | MAHASISWA | Undang anggota |
| POST | `/api/teams/invitations/:memberId/respond` | ✅ | MAHASISWA | Terima/tolak undangan |
| GET | `/api/teams/:teamId/members` | ✅ | MAHASISWA | Get anggota tim |

### 📝 Submissions (Mahasiswa)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/api/submissions` | ✅ | MAHASISWA | Buat pengajuan baru |
| GET | `/api/submissions/my-submissions` | ✅ | MAHASISWA | Get pengajuan saya |
| GET | `/api/submissions/:submissionId` | ✅ | MAHASISWA | Get detail pengajuan |
| PATCH | `/api/submissions/:submissionId` | ✅ | MAHASISWA | Update pengajuan |
| POST | `/api/submissions/:submissionId/submit` | ✅ | MAHASISWA | Submit untuk review |
| POST | `/api/submissions/:submissionId/documents` | ✅ | MAHASISWA | Upload dokumen |
| GET | `/api/submissions/:submissionId/documents` | ✅ | MAHASISWA | Get daftar dokumen |

### 👨‍💼 Admin

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/api/admin/submissions` | ✅ | ADMIN | Get semua pengajuan |
| GET | `/api/admin/submissions/status/:status` | ✅ | ADMIN | Filter by status |
| GET | `/api/admin/submissions/:submissionId` | ✅ | ADMIN | Get detail pengajuan |
| POST | `/api/admin/submissions/:submissionId/approve` | ✅ | ADMIN | Setujui pengajuan |
| POST | `/api/admin/submissions/:submissionId/reject` | ✅ | ADMIN | Tolak pengajuan |
| POST | `/api/admin/submissions/:submissionId/generate-letter` | ✅ | ADMIN | Generate surat |
| GET | `/api/admin/statistics` | ✅ | ADMIN | Get statistik |

## 💾 Database Schema

### Users
- `id`, `nim`, `name`, `email`, `password`
- `role` (MAHASISWA/ADMIN)
- `phone`, `faculty`, `major`, `semester`

### Teams
- `id`, `name`, `leaderId`, `status` (PENDING/FIXED)
- `description`

### Team Members
- `id`, `teamId`, `userId`
- `invitationStatus` (PENDING/ACCEPTED/REJECTED)
- `invitedAt`, `respondedAt`

### Submissions
- `id`, `teamId`, `companyName`, `companyAddress`
- `companySupervisor`, `position`, `startDate`, `endDate`
- `status` (DRAFT/MENUNGGU/DITOLAK/DITERIMA)
- `rejectionReason`, `approvedBy`, `approvedAt`

### Submission Documents
- `id`, `submissionId`, `fileName`, `originalName`
- `fileType`, `fileSize`, `fileUrl`
- `documentType` (KTP/TRANSKRIP/KRS/PROPOSAL/OTHER)

### Generated Letters
- `id`, `submissionId`, `letterNumber`
- `fileName`, `fileUrl`, `fileType` (PDF/DOCX)
- `generatedBy`, `generatedAt`

## 🔒 Security & Validation

- ✅ Input validation dengan Zod
- ✅ JWT authentication pada endpoint sensitif
- ✅ Role-based authorization
- ✅ File type & size validation
- ✅ Secure file storage di R2
- ✅ Password hashing dengan bcrypt

## 📦 Response Format

Semua response mengikuti format standar:

```json
{
  "success": boolean,
  "message": string,
  "data": any | null
}
```

### Error Response Example
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

### Success Response Example
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { ... },
    "token": "eyJhbGc..."
  }
}
```

## 🧪 Testing

Gunakan tools seperti:
- **Postman** - API testing
- **Thunder Client** - VS Code extension
- **curl** - Command line testing

Example register:
```bash
curl -X POST http://localhost:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "nim": "12345678",
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "MAHASISWA"
  }'
```

## 📝 Alur Bisnis

### 1. Pembentukan Tim
1. Mahasiswa register/login
2. Mahasiswa membuat tim
3. Leader undang anggota (by NIM)
4. Anggota terima/tolak undangan
5. Tim status = FIXED jika semua terima

### 2. Pengajuan KP
1. Tim FIXED buat pengajuan (status: DRAFT)
2. Mahasiswa isi data instansi
3. Upload dokumen persyaratan
4. Submit pengajuan (status: MENUNGGU)

### 3. Review Admin
1. Admin lihat daftar pengajuan
2. Admin review detail & dokumen
3. Admin approve → status: DITERIMA (+ generate surat)
4. Admin reject → status: DITOLAK (+ alasan)

## � Dokumentasi Lengkap
- **[Database Migration Guide](DATABASE_MIGRATION_GUIDE.md)** - Panduan lengkap migrasi database dengan Drizzle
- **[Migration Cheatsheet](MIGRATION_CHEATSHEET.md)** - Quick reference untuk commands- **[API Testing Guide](TESTING_GUIDE.md)** - Panduan lengkap testing dengan Postman
- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Solusi error umum & debugging
- **[Postman Collection](postman_collection.json)** - Import untuk testing

## �🛠️ Development Tools

```bash
# Database Studio (GUI)
npm run db:studio

# Generate types untuk Cloudflare
npm run cf-typegen

# View logs
wrangler tail
```

## 📄 License

MIT

---

**Catatan**: Sesuaikan template surat, domain R2, dan konfigurasi lainnya dengan kebutuhan universitas Anda.
