# RINGKASAN BACKEND SIKP
**Sistem Informasi Kerja Praktik (SIKP)**

> ⚠️ **Aturan Wajib**: Setiap perubahan kode backend harus diikuti update file ini **dan** `postman/postman_collection_sso.json` pada commit/PR yang sama.

## 📋 Daftar Isi
1. [Arsitektur Sistem](#arsitektur-sistem)
2. [Teknologi Stack](#teknologi-stack)
3. [Struktur Database](#struktur-database)
4. [API Endpoints](#api-endpoints)
5. [Alur Autentikasi](#alur-autentikasi)
6. [Business Logic](#business-logic)
7. [Integrasi Eksternal](#integrasi-eksternal)
8. [Error Handling](#error-handling)
9. [Deployment](#deployment)

---

## 🏗️ Arsitektur Sistem

### Microservices Architecture (SSO Identity Gateway Pattern)
Backend SIKP menggunakan arsitektur microservices dengan SSO sebagai Identity Gateway:

```
┌─────────────────────────────────────────────────────────────┐
│                 SSO Identity Gateway                        │
│                    (Port 8787)                              │
│                                                             │
│  ┌───────────────┐    ┌──────────────────┐                 │
│  │  Auth Module  │    │  Profile Module  │                 │
│  │               │    │                  │                 │
│  │ • JWT Issuer  │    │ • /profile       │                 │
│  │ • OAuth 2.0   │    │ • /userinfo      │                 │
│  │ • JWKS        │    │ • /search        │                 │
│  └───────────────┘    └──────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ JWT + Profile Data
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend SIKP                             │
│                    (Port 8789)                              │
│                                                             │
│  • Team Management         • Document Upload (R2)           │
│  • Submission Workflow     • Letter Generation              │
│  • Admin Approval          • OAuth Token Proxy              │
└─────────────────────────────────────────────────────────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                              ▼
        ┌─────────────┐               ┌─────────────────┐
        │  Neon DB    │               │ Cloudflare R2   │
        │ (PostgreSQL)│               │ (File Storage)  │
        └─────────────┘               └─────────────────┘
```

**Catatan Penting**: 
- Backend SIKP **TIDAK** mengakses Profile Service secara langsung
- Semua data profil diambil melalui SSO Identity Gateway (`/profile` endpoint)
- SSO bertindak sebagai single point of entry untuk autentikasi dan data profil

### Layered Architecture (Backend SIKP)
```
┌──────────────────────────────────────┐
│          HTTP Requests               │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│     Routes Layer (Hono Router)       │
│  • team.route.ts                     │
│  • submission.route.ts               │
│  • admin.route.ts                    │
│  • auth.route.ts                     │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│   Middlewares (Auth & Authorization) │
│  • authMiddleware() - JWT Verify     │
│  • requireMahasiswa()                │
│  • requireAdmin()                    │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│        Controllers Layer             │
│  • TeamController                    │
│  • SubmissionController              │
│  • AdminController                   │
│  • AuthController                    │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│         Services Layer               │
│  • TeamService (Business Logic)      │
│  • SubmissionService                 │
│  • AdminService                      │
│  • StorageService (R2)               │
│  • LetterService (PDF/DOCX)          │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│       Repositories Layer             │
│  • TeamRepository (Data Access)      │
│  • SubmissionRepository              │
│  • UserRepository                    │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│      Database (Drizzle ORM)          │
│  • Neon DB (Serverless PostgreSQL)   │
└──────────────────────────────────────┘
```

---

## 🛠️ Teknologi Stack

### Runtime & Framework
- **Platform**: Cloudflare Workers (Edge Computing)
- **Framework**: Hono v4.11.3 (Lightweight web framework optimized for edge)
- **Language**: TypeScript
- **Node Compatibility**: nodejs_compat flag enabled

### Database & ORM
- **Database**: Neon DB (Serverless PostgreSQL)
- **ORM**: Drizzle ORM v0.45.1
- **Migration Tool**: Drizzle Kit v0.30.1

### Storage
- **File Storage**: Cloudflare R2 (Object Storage)
- **Bucket Name**: sikp-documents
- **Folders**: 
  - `documents/` - Uploaded documents (KTP, Transkrip, KRS, Proposal)
  - `letters/` - Generated letters (Surat Pengantar)

### Authentication & Security
- **JWT Library**: jose v5.9.6 (JSON Web Encryption and Signing)
- **Algorithm**: RS256 (RSA Signature with SHA-256)
- **Verification**: JWKS (JSON Web Key Set) dari Auth Service
- **Password Hashing**: bcryptjs v2.4.3

### Validation & Utilities
- **Schema Validation**: Zod v3.22.4
- **ID Generation**: nanoid v5.0.9
- **PDF Generation**: pdfkit v0.15.2
- **DOCX Generation**: docx v8.5.0

### Development Tools
- **Runtime Manager**: Wrangler (Cloudflare Workers CLI)
- **Package Manager**: npm/pnpm
- **TypeScript**: v5.x
- **Testing**: Postman Collection v2.1.0 (28 endpoints)

---

## 📊 Struktur Database

### Database Schema (Drizzle ORM)

#### 1. Table: `teams`
**Purpose**: Menyimpan data tim KP (1 ketua + 0-2 anggota)

| Column      | Type                    | Description                          |
|-------------|-------------------------|--------------------------------------|
| `id`        | text (PK)              | Unique team ID                       |
| `code`      | text (unique)          | Team code (e.g., TEAM-ABC123-XYZ456) |
| `leaderId`  | text (FK to Auth User)  | User ID ketua tim                    |
| `status`    | enum                   | PENDING \| FIXED                     |
| `createdAt` | timestamp              | Team creation time                   |

**Relations**:
- `teamMembers[]` - One to Many (cascade delete)
- `submissions[]` - One to Many (cascade delete)

---

#### 2. Table: `team_members`
**Purpose**: Menyimpan anggota tim dan status undangan

| Column            | Type                    | Description                          |
|-------------------|-------------------------|--------------------------------------|
| `id`              | text (PK)              | Unique member ID                     |
| `teamId`          | text (FK)              | Reference to teams.id                |
| `userId`          | text (FK to Auth User)  | User ID anggota                      |
| `role`            | text                   | KETUA \| ANGGOTA                     |
| `invitationStatus`| enum                   | PENDING \| ACCEPTED \| REJECTED      |
| `invitedBy`       | text                   | User ID yang mengundang              |
| `invitedAt`       | timestamp              | Waktu undangan dikirim               |
| `respondedAt`     | timestamp (nullable)   | Waktu respons undangan               |

**Relations**:
- `team` - Many to One (teams)

**Cascade**: Delete member when team is deleted

---

#### 3. Table: `submissions`
**Purpose**: Menyimpan pengajuan KP dari tim

| Column             | Type                       | Description                          |
|--------------------|----------------------------|--------------------------------------|
| `id`               | text (PK)                 | Unique submission ID                 |
| `teamId`           | text (FK)                 | Reference to teams.id                |
| `companyName`      | text                      | Nama perusahaan/instansi             |
| `companyAddress`   | text                      | Alamat perusahaan                    |
| `companyPhone`     | text (nullable)           | Telepon perusahaan                   |
| `companyEmail`     | text (nullable)           | Email perusahaan                     |
| `companySupervisor`| text (nullable)           | Nama supervisor di perusahaan        |
| `position`         | text (nullable)           | Posisi/divisi KP                     |
| `startDate`        | date (nullable)           | Tanggal mulai KP                     |
| `endDate`          | date (nullable)           | Tanggal selesai KP                   |
| `description`      | text (nullable)           | Deskripsi kegiatan KP                |
| `status`           | enum                      | DRAFT \| MENUNGGU \| DITOLAK \| DITERIMA |
| `submittedAt`      | timestamp (nullable)      | Waktu submit untuk review            |
| `approvedAt`       | timestamp (nullable)      | Waktu approval/rejection             |
| `approvedBy`       | text (nullable)           | Admin user ID yang review            |
| `rejectionReason`  | text (nullable)           | Alasan penolakan                     |
| `createdAt`        | timestamp                 | Submission creation time             |

**Relations**:
- `team` - Many to One (teams)
- `documents[]` - One to Many (cascade delete)
- `letters[]` - One to Many (cascade delete)

**Status Flow**:
```
DRAFT → MENUNGGU → DITERIMA
                 ↘ DITOLAK
```

---

#### 4. Table: `submission_documents`
**Purpose**: Menyimpan dokumen yang diupload (KTP, Transkrip, dll)

| Column         | Type                    | Description                          |
|----------------|-------------------------|--------------------------------------|
| `id`           | text (PK)              | Unique document ID                   |
| `submissionId` | text (FK)              | Reference to submissions.id          |
| `fileName`     | text                   | Original filename                    |
| `fileUrl`      | text                   | R2 URL                               |
| `documentType` | enum                   | KTP \| TRANSKRIP \| KRS \| PROPOSAL \| OTHER |
| `uploadedBy`   | text                   | User ID uploader                     |
| `uploadedAt`   | timestamp              | Upload time                          |

**Relations**:
- `submission` - Many to One (submissions)

**File Constraints**:
- Allowed types: PDF, DOC, DOCX
- Max size: 5MB per file

---

#### 5. Table: `generated_letters`
**Purpose**: Menyimpan surat pengantar yang digenerate otomatis

| Column         | Type                    | Description                          |
|----------------|-------------------------|--------------------------------------|
| `id`           | text (PK)              | Unique letter ID                     |
| `submissionId` | text (FK)              | Reference to submissions.id          |
| `letterNumber` | text                   | Nomor surat (auto-generated)         |
| `fileName`     | text                   | Generated filename                   |
| `fileUrl`      | text                   | R2 URL                               |
| `fileType`     | text                   | PDF \| DOCX                          |
| `generatedBy`  | text                   | Admin user ID                        |
| `createdAt`    | timestamp              | Generation time                      |

**Relations**:
- `submission` - Many to One (submissions)

---

### Database Relations Diagram

```
┌──────────────┐
│    teams     │
│              │
│  id (PK)     │◄──────────┐
│  code        │            │
│  leaderId    │            │
│  status      │            │
│  createdAt   │            │
└──────┬───────┘            │
       │                    │
       │ 1:N                │ N:1
       │                    │
┌──────▼──────────┐    ┌────┴────────────────┐
│ team_members    │    │   submissions       │
│                 │    │                     │
│  id (PK)        │    │  id (PK)            │
│  teamId (FK)    │    │  teamId (FK)        │
│  userId         │    │  companyName        │
│  role           │    │  status             │
│  invitationStatus│   │  submittedAt        │
│  invitedAt      │    │  approvedBy         │
│  respondedAt    │    │  ...                │
└─────────────────┘    └──────┬──────────────┘
                              │
                              │ 1:N
                              │
               ┌──────────────┴──────────────┐
               │                             │
       ┌───────▼──────────────┐   ┌─────────▼──────────────┐
       │ submission_documents │   │  generated_letters     │
       │                      │   │                        │
       │  id (PK)             │   │  id (PK)               │
       │  submissionId (FK)   │   │  submissionId (FK)     │
       │  fileName            │   │  letterNumber          │
       │  fileUrl             │   │  fileUrl               │
       │  documentType        │   │  fileType              │
       │  uploadedBy          │   │  generatedBy           │
       └──────────────────────┘   └────────────────────────┘
```

---

## 🌐 API Endpoints

### Base URL
```
http://localhost:8789 (Development)
https://backend-sikp.workers.dev (Production)
```

### Authentication Header
```
Authorization: Bearer <JWT_TOKEN>
```

---

### 📍 Health Check Endpoints

#### 1. Root Health Check
```http
GET /
```
**Response**:
```json
{
  "message": "Backend SIKP is running",
  "timestamp": "2024-02-09T10:30:00.000Z",
  "environment": "development"
}
```

#### 2. Detailed Health Check
```http
GET /health
```
**Response**:
```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "storage": "connected"
  }
}
```

---

### 🔐 Auth Endpoints (`/api/auth`)

#### 1. Exchange Authorization Code (OAuth 2.0)
```http
POST /api/auth/exchange
Content-Type: application/json

{
  "code": "authorization_code_from_sso",
  "codeVerifier": "pkce_code_verifier"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Token exchanged successfully",
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "refresh_token_here",
    "expiresIn": 3600,
    "tokenType": "Bearer"
  }
}
```

**Purpose**: Frontend SIKP menggunakan endpoint ini untuk exchange authorization code dari SSO menjadi access token.

---

#### 2. Refresh Token (OAuth 2.0)
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "refresh_token_here"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "new_access_token...",
    "refreshToken": "new_refresh_token",
    "expiresIn": 3600,
    "tokenType": "Bearer"
  }
}
```

---

#### 3. Get Current User Info
```http
GET /api/auth/me
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "User info retrieved",
  "data": {
    "sub": "user_123",
    "email": "mahasiswa@university.ac.id",
    "name": "John Doe",
    "roles": ["mahasiswa"],
    "mahasiswa": {
      "id": "mhs_123",
      "nim": "220101001",
      "prodi": "Informatika",
      "fakultas": "Teknik",
      "angkatan": 2022
    },
    "dosen": null,
    "admin": null
  }
}
```

**Note**: Endpoint ini proxy ke SSO `/profile` endpoint untuk mendapatkan data profil lengkap.

---

### 👥 Team Management Endpoints (`/api/teams`)

**Auth Required**: Yes (Mahasiswa only)

#### 1. Create Team
```http
POST /api/teams
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Team created successfully",
  "data": {
    "id": "team_123",
    "code": "TEAM-ABC123-XYZ456",
    "leaderId": "user_123",
    "status": "PENDING",
    "createdAt": "2024-02-09T10:30:00.000Z"
  }
}
```

**Business Rules**:
- User must be mahasiswa
- User cannot already be in another team
- Automatically adds creator as KETUA (leader)

---

#### 2. Get My Team
```http
GET /api/teams/my-team
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Team retrieved",
  "data": {
    "team": {
      "id": "team_123",
      "code": "TEAM-ABC123-XYZ456",
      "leaderId": "user_123",
      "status": "PENDING",
      "createdAt": "2024-02-09T10:30:00.000Z"
    },
    "members": [
      {
        "id": "member_1",
        "teamId": "team_123",
        "userId": "user_123",
        "role": "KETUA",
        "invitationStatus": "ACCEPTED",
        "invitedAt": "2024-02-09T10:30:00.000Z"
      },
      {
        "id": "member_2",
        "teamId": "team_123",
        "userId": "user_456",
        "role": "ANGGOTA",
        "invitationStatus": "PENDING",
        "invitedAt": "2024-02-09T10:35:00.000Z",
        "invitedBy": "user_123"
      }
    ]
  }
}
```

---

#### 3. Invite Member
```http
POST /api/teams/:teamId/invite
Headers: Authorization: Bearer <token>
Content-Type: application/json

{
  "nim": "220101002"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Member invited successfully",
  "data": {
    "id": "member_2",
    "teamId": "team_123",
    "userId": "user_456",
    "role": "ANGGOTA",
    "invitationStatus": "PENDING",
    "invitedBy": "user_123",
    "invitedAt": "2024-02-09T10:35:00.000Z"
  }
}
```

**Business Rules**:
- Only team leader can invite
- Team cannot have more than 3 members total
- Cannot invite user already in the team
- Invited user must be mahasiswa
- Invited user cannot already be in another team

**Error Codes**:
- `403`: Not team leader
- `409`: Team is full (max 3 members)
- `409`: User already in team
- `400`: User not found

---

#### 4. Get My Invitations
```http
GET /api/teams/my-invitations
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Invitations retrieved",
  "data": [
    {
      "id": "member_3",
      "teamId": "team_456",
      "userId": "user_123",
      "role": "ANGGOTA",
      "invitationStatus": "PENDING",
      "invitedBy": "user_789",
      "invitedAt": "2024-02-09T11:00:00.000Z",
      "team": {
        "id": "team_456",
        "code": "TEAM-DEF789-GHI012",
        "leaderId": "user_789",
        "status": "PENDING"
      }
    }
  ]
}
```

**Note**: Inviter profile tidak dienrich karena Profile Service access control

---

#### 5. Respond to Invitation
```http
PATCH /api/teams/members/:memberId/respond
Headers: Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "ACCEPT"  // or "REJECT"
}
```

**Response (Accept)**:
```json
{
  "success": true,
  "message": "Invitation accepted successfully",
  "data": {
    "id": "member_3",
    "teamId": "team_456",
    "userId": "user_123",
    "role": "ANGGOTA",
    "invitationStatus": "ACCEPTED",
    "respondedAt": "2024-02-09T11:05:00.000Z"
  }
}
```

**Business Rules**:
- User must be the invited person
- Invitation must be in PENDING status
- When accepting, user's old team (if PENDING) is automatically deleted
- When accepting, other pending invitations are automatically rejected

**Error Codes**:
- `404`: Invitation not found
- `403`: Not authorized to respond
- `409`: Invitation already responded

---

#### 6. Leave Team
```http
DELETE /api/teams/leave
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully left the team"
}
```

**Business Rules**:
- Only ANGGOTA (members) can leave
- KETUA (leader) must delete the team instead
- Member role must be ANGGOTA

**Error Codes**:
- `403`: Cannot leave as team leader
- `404`: Not a member of any team

---

#### 7. Cancel Invitation
```http
DELETE /api/teams/invitations/:invitationId/cancel
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Invitation cancelled successfully"
}
```

**Business Rules**:
- Only team leader can cancel invitations
- Invitation must be in PENDING status

**Error Codes**:
- `404`: Invitation not found
- `403`: Not team leader
- `409`: Cannot cancel non-pending invitation

---

#### 8. Delete Team
```http
DELETE /api/teams/:teamId
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Team deleted successfully"
}
```

**Business Rules**:
- Only team leader can delete
- Cascade deletes all team members
- Cascade deletes all submissions and documents

**Error Codes**:
- `404`: Team not found
- `403`: Not team leader

---

#### 9. Finalize Team
```http
PUT /api/teams/:teamId/finalize
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Team finalized successfully",
  "data": {
    "id": "team_123",
    "code": "TEAM-ABC123-XYZ456",
    "status": "FIXED"
  }
}
```

**Business Rules**:
- Only team leader can finalize
- Locks team composition (no more invites/leaves)
- Required before creating submission

**Error Codes**:
- `404`: Team not found
- `403`: Not team leader
- `409`: Team already fixed

---

#### 10. Join Team by Code
```http
POST /api/teams/join
Headers: Authorization: Bearer <token>
Content-Type: application/json

{
  "teamCode": "TEAM-ABC123-XYZ456"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Join request sent successfully",
  "data": {
    "id": "member_4",
    "teamId": "team_123",
    "userId": "user_999",
    "role": "ANGGOTA",
    "invitationStatus": "PENDING"
  }
}
```

**Business Rules**:
- Self-initiated join by team code
- Team must not be full (max 3 members)
- User cannot already be in another team

---

### 📝 Submission Management Endpoints (`/api/submissions`)

**Auth Required**: Yes (Mahasiswa only)

#### 1. Create Submission
```http
POST /api/submissions
Headers: Authorization: Bearer <token>
Content-Type: application/json

{
  "teamId": "team_123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Submission created",
  "data": {
    "id": "sub_123",
    "teamId": "team_123",
    "companyName": "",
    "companyAddress": "",
    "status": "DRAFT",
    "createdAt": "2024-02-09T12:00:00.000Z"
  }
}
```

**Business Rules**:
- Team must be FIXED status
- User must be team member
- Creates submission in DRAFT state

---

#### 2. Update Submission
```http
PATCH /api/submissions/:submissionId
Headers: Authorization: Bearer <token>
Content-Type: application/json

{
  "companyName": "PT. Tech Indonesia",
  "companyAddress": "Jakarta Selatan",
  "companyPhone": "021-12345678",
  "companyEmail": "hr@tech.co.id",
  "companySupervisor": "Jane Smith",
  "position": "Software Engineer Intern",
  "startDate": "2024-03-01",
  "endDate": "2024-05-31",
  "description": "Internship in backend development team"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Submission updated",
  "data": {
    "id": "sub_123",
    "companyName": "PT. Tech Indonesia",
    "companyAddress": "Jakarta Selatan",
    "status": "DRAFT"
  }
}
```

**Business Rules**:
- Can only update DRAFT submissions
- User must be team member

---

#### 3. Submit for Review
```http
POST /api/submissions/:submissionId/submit
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Submission sent for review",
  "data": {
    "id": "sub_123",
    "status": "MENUNGGU",
    "submittedAt": "2024-02-09T13:00:00.000Z"
  }
}
```

**Business Rules**:
- Can only submit DRAFT submissions
- Requires companyName and companyAddress
- Changes status to MENUNGGU (awaiting review)

---

#### 4. Upload Document
```http
POST /api/submissions/:submissionId/documents
Headers: Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "file": <binary>,
  "documentType": "KTP"  // KTP | TRANSKRIP | KRS | PROPOSAL | OTHER
}
```

**Response**:
```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "id": "doc_123",
    "submissionId": "sub_123",
    "fileName": "KTP-John-Doe.pdf",
    "fileUrl": "https://r2.cloudflare.com/sikp/documents/...",
    "documentType": "KTP",
    "uploadedBy": "user_123",
    "uploadedAt": "2024-02-09T13:15:00.000Z"
  }
}
```

**File Constraints**:
- Allowed types: PDF, DOC, DOCX
- Max size: 5MB
- Stored in Cloudflare R2

---

#### 5. Get My Submissions
```http
GET /api/submissions/my-submissions
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Submissions retrieved",
  "data": [
    {
      "id": "sub_123",
      "teamId": "team_123",
      "companyName": "PT. Tech Indonesia",
      "status": "MENUNGGU",
      "submittedAt": "2024-02-09T13:00:00.000Z",
      "createdAt": "2024-02-09T12:00:00.000Z"
    }
  ]
}
```

---

#### 6. Get Submission Details
```http
GET /api/submissions/:submissionId
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "message": "Submission retrieved",
  "data": {
    "id": "sub_123",
    "teamId": "team_123",
    "companyName": "PT. Tech Indonesia",
    "companyAddress": "Jakarta Selatan",
    "status": "MENUNGGU",
    "documents": [
      {
        "id": "doc_123",
        "fileName": "KTP-John-Doe.pdf",
        "fileUrl": "https://...",
        "documentType": "KTP"
      }
    ]
  }
}
```

---

#### 7. List Submission Documents
```http
GET /api/submissions/:submissionId/documents
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "doc_123",
      "documentType": "KTP",
      "fileName": "KTP-John-Doe.pdf",
      "fileUrl": "https://..."
    },
    {
      "id": "doc_124",
      "documentType": "TRANSKRIP",
      "fileName": "Transkrip-John.pdf",
      "fileUrl": "https://..."
    }
  ]
}
```

---

### 👨‍💼 Admin Endpoints (`/api/admin`)

**Auth Required**: Yes (Admin only)

#### 1. Get All Submissions
```http
GET /api/admin/submissions
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "sub_123",
      "teamId": "team_123",
      "companyName": "PT. Tech Indonesia",
      "status": "MENUNGGU",
      "submittedAt": "2024-02-09T13:00:00.000Z"
    }
  ]
}
```

---

#### 2. Get Submissions by Status
```http
GET /api/admin/submissions/status/:status
Headers: Authorization: Bearer <token>

// :status = DRAFT | MENUNGGU | DITOLAK | DITERIMA
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "sub_123",
      "status": "MENUNGGU",
      "companyName": "PT. Tech Indonesia"
    }
  ]
}
```

---

#### 3. Get Submission Details (Admin)
```http
GET /api/admin/submissions/:submissionId
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "sub_123",
    "teamId": "team_123",
    "companyName": "PT. Tech Indonesia",
    "status": "MENUNGGU",
    "documents": [...],
    "letters": [...]
  }
}
```

---

#### 4. Approve Submission
```http
POST /api/admin/submissions/:submissionId/approve
Headers: Authorization: Bearer <token>
Content-Type: application/json

{
  "autoGenerateLetter": true  // Optional, default false
}
```

**Response**:
```json
{
  "success": true,
  "message": "Submission approved",
  "data": {
    "id": "sub_123",
    "status": "DITERIMA",
    "approvedBy": "admin_123",
    "approvedAt": "2024-02-09T14:00:00.000Z"
  }
}
```

**Business Rules**:
- Can only approve MENUNGGU submissions
- Auto-generates letter if autoGenerateLetter=true

---

#### 5. Reject Submission
```http
POST /api/admin/submissions/:submissionId/reject
Headers: Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Dokumen tidak lengkap"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Submission rejected",
  "data": {
    "id": "sub_123",
    "status": "DITOLAK",
    "rejectionReason": "Dokumen tidak lengkap",
    "approvedBy": "admin_123",
    "approvedAt": "2024-02-09T14:05:00.000Z"
  }
}
```

**Business Rules**:
- Can only reject MENUNGGU submissions
- Rejection reason is required

---

#### 6. Generate Letter
```http
POST /api/admin/submissions/:submissionId/generate-letter
Headers: Authorization: Bearer <token>
Content-Type: application/json

{
  "format": "pdf"  // pdf | docx
}
```

**Response**:
```json
{
  "success": true,
  "message": "Letter generated",
  "data": {
    "id": "letter_123",
    "submissionId": "sub_123",
    "letterNumber": "001/SIKP/II/2024",
    "fileName": "surat-pengantar-sub_123.pdf",
    "fileUrl": "https://r2.cloudflare.com/sikp/letters/...",
    "fileType": "PDF",
    "generatedBy": "admin_123",
    "createdAt": "2024-02-09T14:10:00.000Z"
  }
}
```

**Business Rules**:
- Can only generate for DITERIMA submissions
- Supports PDF and DOCX formats
- Auto-generates letter number

---

#### 7. Get Statistics
```http
GET /api/admin/statistics
Headers: Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "total": 150,
    "draft": 20,
    "pending": 45,
    "approved": 75,
    "rejected": 10
  }
}
```

---

## 🔐 Alur Autentikasi

### 1. OAuth 2.0 Flow dengan SSO Identity Gateway

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Client    │         │  SSO Identity    │         │  Backend SIKP   │
│  (Browser)  │         │  Gateway (8787)  │         │  (Port 8789)    │
└──────┬──────┘         └───────┬──────────┘         └────────┬────────┘
       │                        │                             │
       │ 1. Redirect to SSO     │                             │
       │   /oauth/authorize     │                             │
       ├───────────────────────►│                             │
       │                        │                             │
       │ 2. User login/consent  │                             │
       │◄───────────────────────┤                             │
       │                        │                             │
       │ 3. Redirect back       │                             │
       │   with auth code       │                             │
       │◄───────────────────────┤                             │
       │                        │                             │
       │ 4. POST /api/auth/exchange                           │
       │   { code, codeVerifier }                             │
       ├────────────────────────┼────────────────────────────►│
       │                        │                             │
       │                        │ 5. Exchange code with SSO   │
       │                        │◄────────────────────────────┤
       │                        │                             │
       │                        │ 6. Return tokens            │
       │                        ├────────────────────────────►│
       │                        │                             │
       │ 7. { accessToken, refreshToken }                     │
       │◄───────────────────────┼─────────────────────────────┤
       │                        │                             │
       │ 8. GET /api/auth/me    │                             │
       │   Authorization: Bearer token                        │
       ├────────────────────────┼────────────────────────────►│
       │                        │                             │
       │                        │ 9. Verify JWT (JWKS)        │
       │                        │◄────────────────────────────┤
       │                        │                             │
       │                        │ 10. GET /profile            │
       │                        │◄────────────────────────────┤
       │                        │                             │
       │                        │ 11. Profile data            │
       │                        ├────────────────────────────►│
       │                        │                             │
       │ 12. User data + profile                              │
       │◄───────────────────────┼─────────────────────────────┤
       │                        │                             │
```

### 2. JWT Token Structure

**Header**:
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-id-from-jwks"
}
```

**Payload (Claims)**:
```json
{
  "sub": "user_123",           // userId
  "email": "user@example.com",
  "name": "John Doe",
  "roles": ["mahasiswa"],
  "aud": "sikp-client",        // SSO Client ID
  "iss": "http://localhost:8787",  // SSO Issuer
  "iat": 1707480000,           // Issued at
  "exp": 1707566400            // Expires at (24 hours)
}
```

**Signature**:
```
RSASHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  privateKey  // Hanya SSO yang punya
)
```

### 3. JWKS (JSON Web Key Set)

**JWKS Endpoint**: `http://localhost:8787/.well-known/jwks.json` (SSO)

**Response**:
```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "key-2024-02",
      "use": "sig",
      "alg": "RS256",
      "n": "public-key-modulus...",
      "e": "AQAB"
    }
  ]
}
```

**Backend SIKP**:
- Cache JWKS selama 1 jam
- Gunakan public key untuk verify signature
- Extract claims setelah verified
- Issuer dan audience harus sesuai dengan SSO configuration

### 4. authMiddleware Flow

```typescript
// src/middlewares/auth.middleware.ts

export const authMiddleware = () => {
  return async (c: Context, next: Next) => {
    // 1. Extract token from header
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      // 2. Get SSO config from environment
      const ssoIssuer = c.env.SSO_ISSUER;
      const ssoJwksUrl = c.env.SSO_JWKS_URL;
      const ssoClientId = c.env.SSO_CLIENT_ID;  // audience

      // 3. Fetch JWKS (cached)
      const JWKS = createRemoteJWKSet(new URL(ssoJwksUrl));

      // 4. Verify JWT
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: ssoIssuer,
        audience: ssoClientId,
      });

      // 5. Extract claims
      const auth: AuthContext = {
        userId: payload.sub as string,
        email: payload.email as string,
        name: payload.name as string,
        roles: payload.roles as string[],
        permissions: payload.permissions as string[],
      };

      // 5. Set auth context
      c.set('auth', auth);

      // 6. Continue to next handler
      await next();
    } catch (error) {
      return c.json({ error: 'Unauthorized', message: 'Invalid token' }, 401);
    }
  };
};
```

### 5. Role-Based Authorization

```typescript
// src/middlewares/auth.middleware.ts

// Require mahasiswa role
export const requireMahasiswa = () => {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth');
    
    if (!auth.roles.includes('mahasiswa')) {
      return c.json(
        { error: 'Forbidden', message: 'Mahasiswa role required' },
        403
      );
    }
    
    await next();
  };
};

// Require admin role
export const requireAdmin = () => {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth');
    
    if (!auth.roles.includes('admin')) {
      return c.json(
        { error: 'Forbidden', message: 'Admin role required' },
        403
      );
    }
    
    await next();
  };
};
```

### 6. Usage in Routes

```typescript
// src/routes/team.route.ts

export const createTeamRoutes = (teamController: TeamController) => {
  const team = new Hono();

  // Apply auth middleware to all routes
  team.use('*', authMiddleware());
  team.use('*', requireMahasiswa());

  // Now all routes require valid JWT + mahasiswa role
  team.post('/', teamController.createTeam);
  team.get('/my-team', teamController.getMyTeam);
  // ...

  return team;
};
```

---

## 💼 Business Logic

### 1. Team Management Flow

#### Scenario: Membuat Tim dan Mengundang Anggota

```
1. MAHASISWA A - Create Team
   ├─ Verify: User is mahasiswa (via Profile Service)
   ├─ Verify: User tidak sudah punya tim
   ├─ Create team dengan auto-generated code
   ├─ Add creator sebagai KETUA (auto-ACCEPTED)
   └─ Return: Team dengan status PENDING

2. MAHASISWA A - Invite MAHASISWA B
   ├─ Verify: A adalah ketua tim
   ├─ Verify: Tim belum penuh (max 3)
   ├─ Verify: B adalah mahasiswa (via Profile Service)
   ├─ Verify: B tidak sudah di tim ini
   ├─ Verify: B tidak sudah di tim lain
   ├─ Create team_member entry (status: PENDING)
   └─ Return: Invitation

3. MAHASISWA B - View Invitations
   ├─ Query team_members where userId = B
   ├─ Filter: invitationStatus = PENDING
   ├─ Join with teams table
   └─ Return: List of invitations

4. MAHASISWA B - Accept Invitation
   ├─ Verify: B adalah yang diundang
   ├─ Verify: Status masih PENDING
   ├─ IF B punya tim lain (status PENDING):
   │  └─ Delete B's old team (cascade members)
   ├─ Update invitationStatus = ACCEPTED
   ├─ Reject other pending invitations for B
   └─ Return: Updated membership

5. MAHASISWA A - Finalize Team
   ├─ Verify: A adalah ketua
   ├─ Update team.status = FIXED
   └─ Return: Team (locked, ready for submission)
```

**State Diagram - Team Lifecycle**:
```
┌──────────┐    Invite Member     ┌─────────┐
│ PENDING  │───────────────────►  │ PENDING │
│ (Team)   │                      │ (+ 1-2  │
│          │◄───────────────────  │ members)│
└────┬─────┘    Remove/Reject     └────┬────┘
     │                                 │
     │ Finalize Team                   │ Finalize Team
     │                                 │
     ▼                                 ▼
┌─────────────────────────────────────────┐
│              FIXED                      │
│  (Locked, ready for submission)         │
└─────────────────────────────────────────┘
```

### 2. Submission Workflow

```
1. CREATE SUBMISSION
   ├─ Verify: Team is FIXED
   ├─ Verify: User is team member
   ├─ Create submission (status: DRAFT)
   └─ Return: Draft submission

2. UPDATE SUBMISSION (Multiple Times)
   ├─ Verify: Status is DRAFT
   ├─ Verify: User is team member
   ├─ Update fields (companyName, address, etc.)
   └─ Return: Updated submission

3. UPLOAD DOCUMENTS
   ├─ Verify: User is team member
   ├─ Validate: File type (PDF/DOCX)
   ├─ Validate: File size (max 5MB)
   ├─ Upload to R2: documents/
   ├─ Save metadata to DB
   └─ Return: Document record

4. SUBMIT FOR REVIEW
   ├─ Verify: Status is DRAFT
   ├─ Verify: Required fields (companyName, address)
   ├─ Update status = MENUNGGU
   ├─ Set submittedAt timestamp
   └─ Return: Submitted submission

5. ADMIN REVIEW
   ├─ View all submissions (filter by MENUNGGU)
   ├─ Review documents
   └─ Decide: APPROVE or REJECT

6a. ADMIN - APPROVE
    ├─ Verify: Status is MENUNGGU
    ├─ Update status = DITERIMA
    ├─ Set approvedBy = adminId
    ├─ Set approvedAt timestamp
    ├─ Optional: Auto-generate letter
    └─ Return: Approved submission

6b. ADMIN - REJECT
    ├─ Verify: Status is MENUNGGU
    ├─ Verify: Rejection reason provided
    ├─ Update status = DITOLAK
    ├─ Save rejectionReason
    ├─ Set approvedBy = adminId
    └─ Return: Rejected submission

7. GENERATE LETTER (DITERIMA only)
   ├─ Verify: Status is DITERIMA
   ├─ Generate letter number (001/SIKP/II/2024)
   ├─ Create PDF or DOCX
   ├─ Upload to R2: letters/
   ├─ Save to generated_letters table
   └─ Return: Letter metadata
```

**State Diagram - Submission Lifecycle**:
```
┌───────┐
│ DRAFT │  ←── Initial state
└───┬───┘      (Can edit freely)
    │
    │ Submit for Review
    │ (requires: companyName, address)
    ▼
┌──────────┐
│ MENUNGGU │  ←── Awaiting admin review
└────┬─────┘
     │
     ├─────────────┬─────────────┐
     │             │             │
     │ Approve     │ Reject      │
     │             │             │
     ▼             ▼             │
┌──────────┐  ┌─────────┐       │
│ DITERIMA │  │ DITOLAK │       │
└────┬─────┘  └─────────┘       │
     │                           │
     │ Generate Letter           │
     │ (PDF/DOCX)               │
     ▼                           │
┌──────────────┐                │
│ Letter Ready │                │
└──────────────┘                │
```

### 3. SSO Identity Gateway Integration

Backend SIKP berkomunikasi dengan SSO untuk:

#### Use Case 1: Verify User via JWT
```typescript
// JWT claims sudah berisi roles
const auth = c.get('auth');
if (!auth.roles.includes('mahasiswa')) {
  throw new HTTPException(403, { message: 'Mahasiswa role required' });
}
```

#### Use Case 2: Get Full Profile via SSO
```typescript
// Get profile via SSO Gateway (bukan langsung ke Profile Service)
const ssoClient = new SSOClient(SSO_BASE_URL, token);
const profileResponse = await ssoClient.getProfile();

// Response structure:
{
  success: true,
  data: {
    sub: "user_123",
    email: "john@university.ac.id",
    name: "John Doe",
    roles: ["mahasiswa"],
    mahasiswa: {
      id: "mhs_123",
      nim: "220101001",
      prodi: "Informatika",
      fakultas: "Teknik"
    }
  }
}
```

#### Use Case 3: Find Mahasiswa by NIM
```typescript
// Search mahasiswa via SSO Gateway
const ssoClient = new SSOClient(SSO_BASE_URL, token);
const result = await ssoClient.findMahasiswaByNim(nim);

if (!result.success || !result.data) {
  throw new HTTPException(404, { message: 'Mahasiswa not found' });
}

const authUserId = result.data.sub;
// Use authUserId to add to team
```

**SSO Client** (`src/lib/sso-client.ts`):
```typescript
export class SSOClient {
  constructor(private baseUrl: string, private token: string) {}

  async getProfile(): Promise<SSOProfileResponse> {
    return this.fetch('/profile');
  }

  async getUserinfo(): Promise<SSOUserinfoResponse> {
    return this.fetch('/userinfo');
  }

  async findMahasiswaByNim(nim: string): Promise<SSOProfileResponse> {
    return this.fetch(`/profile/search?nim=${encodeURIComponent(nim)}`);
  }
}
```

**Catatan Penting**:
- ❌ Backend SIKP **TIDAK** mengakses Profile Service langsung
- ✅ Semua data profil diambil melalui SSO Identity Gateway
- ✅ SSO menangani aggregation dari Profile Service

### 4. Storage Service (R2)

#### Upload Flow
```typescript
// src/services/storage.service.ts

async uploadFile(file: File, fileName: string, folder: string) {
  // 1. Generate unique key
  const uniqueKey = `${folder}/${Date.now()}-${nanoid(10)}-${fileName}`;
  
  // 2. Upload to R2
  await this.r2Bucket.put(uniqueKey, file);
  
  // 3. Generate public URL
  const url = `https://r2-domain.com/${uniqueKey}`;
  
  return { url, key: uniqueKey };
}
```

**File Organization**:
```
sikp-documents/  (R2 Bucket)
├── documents/
│   ├── 1707480000-abc123xyz-KTP-John.pdf
│   ├── 1707480100-def456uvw-Transkrip-John.pdf
│   └── 1707480200-ghi789rst-KRS-John.pdf
└── letters/
    ├── 1707490000-jkl012mno-surat-pengantar-sub_123.pdf
    └── 1707490100-pqr345stu-surat-pengantar-sub_124.docx
```

**File Constraints**:
```typescript
// Validation
validateFileType(fileName: string, allowedTypes: string[]) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext ? allowedTypes.includes(ext) : false;
}

validateFileSize(size: number, maxSizeMB: number) {
  const maxBytes = maxSizeMB * 1024 * 1024;
  return size <= maxBytes;
}

// Usage
const allowedTypes = ['pdf', 'doc', 'docx'];
const maxSizeMB = 5;

if (!storageService.validateFileType(file.name, allowedTypes)) {
  throw new HTTPException(400, { message: 'Invalid file type' });
}

if (!storageService.validateFileSize(file.size, maxSizeMB)) {
  throw new HTTPException(400, { message: 'File too large (max 5MB)' });
}
```

### 5. Letter Generation

```typescript
// src/services/letter.service.ts

async generateLetter(submissionId: string, adminId: string, format: 'pdf' | 'docx') {
  // 1. Get submission data
  const submission = await submissionRepo.findById(submissionId);
  
  // 2. Generate letter number
  const letterNumber = await this.generateLetterNumber();
  // Format: 001/SIKP/II/2024
  
  // 3. Generate file
  let fileBuffer: Buffer;
  if (format === 'pdf') {
    fileBuffer = await this.generatePDF(submission, letterNumber);
  } else {
    fileBuffer = await this.generateDOCX(submission, letterNumber);
  }
  
  // 4. Upload to R2
  const fileName = `surat-pengantar-${submission.id}.${format}`;
  const { url, key } = await storageService.uploadFile(fileBuffer, fileName, 'letters');
  
  // 5. Save to database
  const letter = await submissionRepo.addGeneratedLetter({
    id: generateId(),
    submissionId,
    letterNumber,
    fileName,
    fileUrl: url,
    fileType: format.toUpperCase(),
    generatedBy: adminId,
  });
  
  return letter;
}
```

**Letter Template Structure**:
```
┌─────────────────────────────────────┐
│   UNIVERSITAS [NAMA UNIVERSITAS]    │
│     Fakultas [Nama Fakultas]        │
├─────────────────────────────────────┤
│                                     │
│ Nomor: 001/SIKP/II/2024             │
│ Tanggal: 09 Februari 2024           │
│                                     │
│  SURAT PENGANTAR KERJA PRAKTIK      │
│  ================================    │
│                                     │
│ Kepada Yth.                         │
│ HRD PT. Tech Indonesia              │
│ di Jakarta Selatan                  │
│                                     │
│ Dengan hormat,                      │
│                                     │
│ Kami mengajukan mahasiswa berikut   │
│ untuk melaksanakan Kerja Praktik:   │
│                                     │
│ Nama   : John Doe                   │
│ NIM    : 220101001                  │
│ Prodi  : Informatika                │
│ Periode: 01 Maret - 31 Mei 2024     │
│                                     │
│ Demikian surat pengantar ini kami   │
│ sampaikan. Terima kasih.            │
│                                     │
│           Hormat kami,              │
│                                     │
│        [Nama Dekan/Kaprodi]         │
│        NIP. xxxxxxxxxxxx            │
└─────────────────────────────────────┘
```

---

## 🔌 Integrasi Eksternal

### 1. SSO Identity Gateway Integration

**Base URL**: `http://localhost:8787`

Backend SIKP berkomunikasi **HANYA** dengan SSO Identity Gateway. Tidak ada akses langsung ke Profile Service.

#### Endpoints Used by Backend SIKP:

##### 1.1 JWKS Endpoint
```http
GET /.well-known/jwks.json
```

**Purpose**: Mendapatkan public key untuk verify JWT signature

**Response**:
```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "key-2024-02",
      "use": "sig",
      "alg": "RS256",
      "n": "modulus...",
      "e": "AQAB"
    }
  ]
}
```

**Usage in Backend SIKP**:
```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(c.env.SSO_JWKS_URL)  // http://localhost:8787/.well-known/jwks.json
);

const { payload } = await jwtVerify(token, JWKS, {
  issuer: c.env.SSO_ISSUER,      // http://localhost:8787
  audience: c.env.SSO_CLIENT_ID, // sikp-client
});
```

**Caching**: JWKS di-cache selama 1 jam untuk performance

---

##### 1.2 OAuth Token Exchange
```http
POST /oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "auth_code",
  "code_verifier": "pkce_verifier",
  "client_id": "sikp-client",
  "client_secret": "secret",
  "redirect_uri": "http://localhost:5174/callback"
}
```

**Purpose**: Exchange authorization code untuk access/refresh tokens

**Response**:
```json
{
  "access_token": "eyJhbGciOiI...",
  "refresh_token": "refresh_token...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

**Usage in Backend SIKP** (AuthController.exchange):
```typescript
const tokenResponse = await fetch(`${SSO_BASE_URL}/oauth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: c.env.SSO_CLIENT_ID,
    client_secret: c.env.SSO_CLIENT_SECRET,
    redirect_uri: c.env.SSO_REDIRECT_URI,
  }),
});
```

---

##### 1.3 Get User Profile
```http
GET /profile
Headers: Authorization: Bearer <token>
```

**Purpose**: Mendapatkan profil lengkap user (mahasiswa/dosen/admin)

**Response**:
```json
{
  "success": true,
  "data": {
    "sub": "user_123",
    "email": "john@university.ac.id",
    "name": "John Doe",
    "roles": ["mahasiswa"],
    "mahasiswa": {
      "id": "mhs_123",
      "nim": "220101001",
      "prodi": "Informatika",
      "fakultas": "Teknik",
      "angkatan": 2022
    },
    "dosen": null,
    "admin": null
  }
}
```

**Usage in Backend SIKP** (SSOClient):
```typescript
// src/lib/sso-client.ts
const ssoClient = createSSOClient(SSO_BASE_URL, token);
const profileResponse = await ssoClient.getProfile();
```

---

##### 1.4 Search Mahasiswa by NIM
```http
GET /profile/search?nim=220101001
Headers: Authorization: Bearer <token>
```

**Purpose**: Find mahasiswa untuk invite ke team

**Response**:
```json
{
  "success": true,
  "data": {
    "sub": "user_456",
    "email": "jane@university.ac.id",
    "name": "Jane Smith",
    "roles": ["mahasiswa"],
    "mahasiswa": {
      "id": "mhs_456",
      "nim": "220101002",
      ...
    }
  }
}
```

**Usage**:
```typescript
const ssoClient = createSSOClient(SSO_BASE_URL, token);
const result = await ssoClient.findMahasiswaByNim(nim);

if (!result.success || !result.data) {
  throw new HTTPException(404, { message: 'Mahasiswa not found' });
}

const authUserId = result.data.sub;
```

---

### 2. ⚠️ Profile Service (TIDAK DIAKSES LANGSUNG)

**PENTING**: Backend SIKP **TIDAK** mengakses Profile Service secara langsung.

**Alasan**:
- SSO bertindak sebagai Identity Gateway
- Profile Service hanya diakses oleh SSO
- Access control dan aggregation ditangani oleh SSO

**Arsitektur Benar**:
```
Frontend → Backend SIKP → SSO Gateway → Profile Service
                    ↓
               ❌ TIDAK LANGSUNG
```

---

### 3. Neon DB (PostgreSQL)

**Connection**: Via Drizzle ORM

**Configuration**:
```typescript
// drizzle.config.ts
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL,
  },
};
```

**Environment Variable**:
```bash
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

**Connection Pool**: Managed by Neon (serverless)

---

### 4. Cloudflare R2 (Object Storage)

**Binding**: Via wrangler.jsonc

**Configuration**:
```jsonc
{
  "r2_buckets": [
    {
      "binding": "R2_BUCKET",
      "bucket_name": "sikp-documents"
    }
  ]
}
```

**Access in Code**:
```typescript
// src/index.ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const r2Bucket = env.R2_BUCKET;  // ← Auto-injected by Cloudflare Workers
    
    const storageService = new StorageService(r2Bucket);
    // ...
  }
}
```

**API Operations**:
```typescript
// Upload
await r2Bucket.put(key, fileData);

// Download
const object = await r2Bucket.get(key);
const data = await object.arrayBuffer();

// Delete
await r2Bucket.delete(key);

// List
const objects = await r2Bucket.list({ prefix: 'documents/' });
```

---

## ⚠️ Error Handling

### 1. Error Response Format

**Standard Error Response**:
```json
{
  "success": false,
  "message": "Error message here"
}
```

**HTTP Status Codes** (Semantic):
- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing/invalid token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Business logic conflict (e.g., team full, already exists)
- `500 Internal Server Error` - Unexpected error

---

### 2. HTTPException Pattern (Hono)

```typescript
import { HTTPException } from 'hono/http-exception';

// Throw HTTPException with status code
throw new HTTPException(409, { 
  message: 'Team already exists' 
});

// Caught by handleError helper
export const handleError = (c: Context, error: any, defaultMessage: string) => {
  console.error('Error:', error);
  
  if (error instanceof HTTPException) {
    return c.json(
      createResponse(false, error.message),
      error.status  // ← Use status from exception
    );
  }
  
  // Fallback for unknown errors
  return c.json(
    createResponse(false, error.message || defaultMessage),
    500
  );
};
```

---

### 3. Error Examples by Use Case

#### 3.1 Authentication Errors (401)
```typescript
// Missing token
{
  "error": "Unauthorized",
  "message": "No token provided"
}

// Invalid token
{
  "error": "Unauthorized",
  "message": "Invalid token"
}

// Expired token
{
  "error": "Unauthorized",
  "message": "Token expired"
}
```

---

#### 3.2 Authorization Errors (403)
```typescript
// Not team leader
throw new HTTPException(403, { 
  message: 'Only team leader can invite members' 
});

// Wrong role
{
  "error": "Forbidden",
  "message": "Mahasiswa role required"
}

// Cannot leave as leader
throw new HTTPException(403, { 
  message: 'Team leader cannot leave. Delete the team instead.' 
});
```

---

#### 3.3 Validation Errors (400)
```typescript
// Invalid NIM format
throw new HTTPException(400, { 
  message: 'Invalid NIM format' 
});

// Missing required fields
throw new HTTPException(400, { 
  message: 'Company name and address are required' 
});

// Invalid file type
throw new HTTPException(400, { 
  message: 'Only PDF and DOCX are allowed' 
});

// File too large
throw new HTTPException(400, { 
  message: 'File size exceeds 5MB limit' 
});
```

---

#### 3.4 Not Found Errors (404)
```typescript
// Team not found
throw new HTTPException(404, { 
  message: 'Team not found' 
});

// Mahasiswa not found
throw new HTTPException(404, { 
  message: 'Mahasiswa not found' 
});

// Invitation not found
throw new HTTPException(404, { 
  message: 'Invitation not found' 
});
```

---

#### 3.5 Conflict Errors (409)
```typescript
// User already in team
throw new HTTPException(409, { 
  message: 'You already have a team' 
});

// Team is full
throw new HTTPException(409, { 
  message: 'Team is full (maximum 3 members)' 
});

// User already in this team
throw new HTTPException(409, { 
  message: 'User is already in this team' 
});

// Invitation already responded
throw new HTTPException(409, { 
  message: 'Invitation has already been responded to' 
});

// Team already fixed
throw new HTTPException(409, { 
  message: 'Team is already fixed' 
});

// Submission already submitted
throw new HTTPException(409, { 
  message: 'Submission already submitted' 
});
```

---

### 4. Error Logging

```typescript
// src/utils/helpers.ts

export const handleError = (c: Context, error: any, defaultMessage: string) => {
  // Log error details to console (CloudFlare logs)
  console.error('Error:', {
    message: error.message,
    stack: error.stack,
    statusCode: error instanceof HTTPException ? error.status : 500,
    path: c.req.path,
    method: c.req.method,
  });
  
  // Return sanitized error to client
  if (error instanceof HTTPException) {
    return c.json(createResponse(false, error.message), error.status);
  }
  
  return c.json(createResponse(false, defaultMessage), 500);
};
```

**CloudFlare Workers Logs**:
- View logs in Cloudflare Dashboard
- Or use `wrangler tail` CLI command
- Logs include: timestamp, request details, console output

---

### 5. Database Error Handling

```typescript
// Drizzle ORM errors
try {
  const result = await db.insert(teams).values(data).returning();
  return result[0];
} catch (error) {
  if (error.code === '23505') {
    // Unique constraint violation
    throw new HTTPException(409, { 
      message: 'Team code already exists' 
    });
  }
  
  if (error.code === '23503') {
    // Foreign key violation
    throw new HTTPException(400, { 
      message: 'Referenced resource not found' 
    });
  }
  
  // Unknown database error
  console.error('Database error:', error);
  throw new HTTPException(500, { 
    message: 'Database operation failed' 
  });
}
```

---

## 🚀 Deployment

### 1. Development Setup

#### Prerequisites
```bash
# Node.js 18+ required
node --version  # v18.0.0 or higher

# Cloudflare account (free tier available)
# Neon DB account (free tier available)
```

#### Installation
```bash
# Clone repository
git clone https://github.com/your-repo/backend-sikp.git
cd backend-sikp

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your credentials
```

#### Environment Variables
```bash
# .env
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"

# SSO Configuration (Identity Gateway)
SSO_BASE_URL="http://localhost:8787"
SSO_JWKS_URL="http://localhost:8787/.well-known/jwks.json"
SSO_ISSUER="http://localhost:8787"
SSO_CLIENT_ID="sikp-client"
SSO_CLIENT_SECRET="your-client-secret"
SSO_REDIRECT_URI="http://localhost:5174/callback"

# R2 (configured in wrangler.jsonc)
# Note: Profile Service TIDAK diakses langsung, semua melalui SSO
```

#### Database Migration
```bash
# Generate migration files
npm run db:generate

# Run migrations
npm run db:migrate

# Open Drizzle Studio (DB GUI)
npm run db:studio
```

#### Start Development Server
```bash
# Run locally with Wrangler
npm run dev

# Server runs on http://localhost:8789
```

---

### 2. Production Deployment (Cloudflare Workers)

#### Step 1: Configure wrangler.jsonc
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "backend-sikp",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-12",
  "compatibility_flags": ["nodejs_compat"],
  
  "r2_buckets": [
    {
      "binding": "R2_BUCKET",
      "bucket_name": "sikp-documents-prod"
    }
  ],
  
  "vars": {
    "ENVIRONMENT": "production",
    "AUTH_SERVICE_URL": "https://auth.yourdomain.com",
    "PROFILE_SERVICE_URL": "https://profile.yourdomain.com"
  }
}
```

#### Step 2: Create R2 Bucket
```bash
# Create R2 bucket
wrangler r2 bucket create sikp-documents-prod

# Verify
wrangler r2 bucket list
```

#### Step 3: Set Secrets (Database URL)
```bash
# Set DATABASE_URL as secret (not in wrangler.jsonc)
wrangler secret put DATABASE_URL
# Paste your Neon DB connection string
```

#### Step 4: Deploy
```bash
# Deploy to Cloudflare Workers
npm run deploy

# or
wrangler deploy
```

**Output**:
```
Uploaded backend-sikp (2.3 MiB compressed)
Published backend-sikp (0.12 sec)
  https://backend-sikp.your-subdomain.workers.dev
```

#### Step 5: Custom Domain (Optional)
```bash
# Add custom domain in Cloudflare Dashboard
# Workers & Pages > backend-sikp > Settings > Domains
# Add: api.yourdomain.com

# Or via CLI
wrangler domains add api.yourdomain.com
```

---

### 3. Database Migration in Production

```bash
# Run migrations against production DB
DATABASE_URL="postgresql://prod..." npm run db:migrate

# Or use Drizzle Kit directly
npx drizzle-kit push:pg --config drizzle.config.ts
```

**Warning**: Always backup database before migration!

---

### 4. Monitoring & Logs

#### View Logs
```bash
# Tail logs in real-time
wrangler tail

# Filter by status code
wrangler tail --status 500
```

#### Cloudflare Dashboard
- **Analytics**: Workers & Pages > backend-sikp > Analytics
  - Requests per day
  - Error rate
  - Response time
  - CPU usage

- **Logs**: Workers & Pages > backend-sikp > Logs
  - Real-time log stream
  - Filter by timestamp, status, method

#### Custom Metrics (Optional)
```typescript
// Add custom logging
export default {
  async fetch(request: Request, env: Env) {
    const startTime = Date.now();
    
    try {
      const response = await app.fetch(request, env);
      
      const duration = Date.now() - startTime;
      console.log(`[${request.method}] ${request.url} - ${response.status} (${duration}ms)`);
      
      return response;
    } catch (error) {
      console.error('Unhandled error:', error);
      throw error;
    }
  }
}
```

---

### 5. CI/CD Pipeline (GitHub Actions)

#### .github/workflows/deploy.yml
```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests (if any)
        run: npm test
      
      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
```

#### Setup Secrets in GitHub
1. Go to GitHub repo → Settings → Secrets → Actions
2. Add `CLOUDFLARE_API_TOKEN`:
   - Generate token: Cloudflare Dashboard → My Profile → API Tokens
   - Template: "Edit Cloudflare Workers"

---

### 6. Performance Optimization

#### Edge Caching (JWKS)
```typescript
// Cache JWKS for 1 hour
const JWKS = createRemoteJWKSet(
  new URL(AUTH_SERVICE_JWKS_URL),
  {
    cacheMaxAge: 3600000,  // 1 hour in ms
  }
);
```

#### Database Connection Pooling
- Managed by Neon (serverless pooling)
- No manual configuration needed
- Auto-scales with traffic

#### R2 Direct Uploads (Future Enhancement)
```typescript
// Generate presigned URL for client-side upload
async generatePresignedUploadUrl(fileName: string) {
  const key = `documents/${Date.now()}-${fileName}`;
  const presignedUrl = await r2Bucket.generatePresignedPost(key, {
    expiresIn: 3600,  // 1 hour
  });
  
  return { uploadUrl: presignedUrl, key };
}
```

**Benefits**:
- Client uploads directly to R2 (bypass worker)
- Reduces worker CPU usage
- Faster upload for large files

---

### 7. Backup & Recovery

#### Database Backup (Neon)
- **Automatic**: Neon creates daily backups (retained 7 days on free tier)
- **Manual**: Export via Drizzle Studio or `pg_dump`

```bash
# Export database
pg_dump $DATABASE_URL > backup.sql

# Import database
psql $DATABASE_URL < backup.sql
```

#### R2 Bucket Backup
```bash
# Download all files from R2
wrangler r2 object download sikp-documents --all --output ./backup/

# Upload to new bucket
wrangler r2 object upload sikp-documents-backup --file ./backup/
```

---

### 8. Rollback Strategy

#### Rollback Worker Deployment
```bash
# List deployments
wrangler deployments list

# Rollback to previous version
wrangler rollback --version <version-id>
```

#### Rollback Database Migration
```bash
# Drizzle doesn't support automatic rollback
# Manual rollback required:

# 1. Identify migration to rollback
ls drizzle/

# 2. Write reverse migration SQL
# Example: 0007_rollback_add_role.sql
ALTER TABLE team_members DROP COLUMN role;

# 3. Execute manually
psql $DATABASE_URL < drizzle/0007_rollback_add_role.sql
```

---

## 📚 Additional Resources

### Documentation
- **Hono**: https://hono.dev/
- **Drizzle ORM**: https://orm.drizzle.team/
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Cloudflare R2**: https://developers.cloudflare.com/r2/
- **Neon DB**: https://neon.tech/docs
- **jose (JWT)**: https://github.com/panva/jose

### Testing
**Postman Collection**: `postman/postman_collection_sso.json`
- 28 automated test scripts
- 6 folders: Health Check, Auth, User Info, Teams, Submissions, Admin
- Newman CLI support: `newman run postman/postman_collection_sso.json`

### Project Structure Summary
```
backend-sikp/
├── src/
│   ├── index.ts                    # App entry point
│   ├── controllers/                # HTTP handlers
│   │   ├── auth.controller.ts
│   │   ├── team.controller.ts
│   │   ├── submission.controller.ts
│   │   └── admin.controller.ts
│   ├── services/                   # Business logic
│   │   ├── team.service.ts
│   │   ├── submission.service.ts
│   │   ├── admin.service.ts
│   │   ├── storage.service.ts      # R2 integration
│   │   └── letter.service.ts       # PDF/DOCX generation
│   ├── repositories/               # Data access
│   │   ├── team.repository.ts
│   │   ├── submission.repository.ts
│   │   └── user.repository.ts
│   ├── routes/                     # Route definitions
│   │   ├── auth.route.ts
│   │   ├── team.route.ts
│   │   ├── submission.route.ts
│   │   └── admin.route.ts
│   ├── middlewares/                # Auth & guards
│   │   └── auth.middleware.ts
│   ├── db/                         # Database
│   │   ├── schema.ts               # Drizzle schema
│   │   ├── index.ts                # DB client
│   │   └── migrate.ts              # Migration runner
│   ├── utils/                      # Helpers
│   │   ├── helpers.ts              # Common utilities
│   │   └── profile-service.ts      # Profile Service client
│   └── types/
│       └── index.ts                # TypeScript types
├── drizzle/                        # Migration files
│   ├── 0000_initial.sql
│   ├── 0001_add_teams.sql
│   └── ...
├── postman/
│   └── postman_collection_sso.json
├── package.json
├── tsconfig.json
├── wrangler.jsonc                  # Cloudflare config
├── drizzle.config.ts               # Drizzle config
└── README.md
```

---

## 🎯 Key Takeaways

### Architecture Highlights
✅ **SSO Identity Gateway**: Single point untuk auth dan profile data  
✅ **Edge Computing**: Deploy di Cloudflare Workers (low latency, global)  
✅ **Serverless DB**: Neon PostgreSQL (auto-scaling, no management)  
✅ **Object Storage**: R2 untuk dokumen (unlimited, $0.015/GB)  
✅ **OAuth 2.0 + JWT**: RS256 dengan JWKS verification (secure, stateless)  

### Business Logic Highlights
✅ **Team Management**: Ketua + max 2 anggota, invitation system  
✅ **Submission Workflow**: Draft → Review → Approve/Reject  
✅ **Document Upload**: KTP, Transkrip, KRS, Proposal (max 5MB each)  
✅ **Letter Generation**: PDF/DOCX surat pengantar otomatis  
✅ **Role-Based Access**: Mahasiswa (create/submit), Admin (review/approve)  

### Technical Highlights
✅ **Layered Architecture**: Routes → Controllers → Services → Repositories  
✅ **Error Handling**: Semantic HTTP status codes (401/403/404/409)  
✅ **Type Safety**: TypeScript + Zod validation  
✅ **ORM**: Drizzle (type-safe, fast, migrations)  
✅ **SSO Client**: Dedicated client untuk komunikasi dengan SSO Gateway  
✅ **Testing**: Postman collection dengan 28 automated tests  

---

## 📝 Changelog

### Version 2.0.0 (Feb 2026)
- ✅ **REFACTOR**: SSO Identity Gateway pattern
- ✅ OAuth 2.0 endpoints (`/auth/exchange`, `/auth/refresh`)
- ✅ Profile data via SSO `/profile` endpoint (tidak langsung ke Profile Service)
- ✅ SSOClient untuk komunikasi dengan SSO Gateway
- ✅ Environment variables untuk SSO configuration
- ✅ Updated Postman collection dengan OAuth flow

### Version 1.0.0 (Feb 2024)
- ✅ Initial release
- ✅ JWT authentication with Auth Service
- ✅ Team management (create, invite, accept/reject)
- ✅ Submission workflow (draft, submit, review)
- ✅ Document upload (R2 integration)
- ✅ Admin approval/rejection
- ✅ Letter generation (PDF/DOCX)
- ✅ Error handling dengan HTTPException
- ✅ Database migration dengan Drizzle
- ✅ Postman testing collection

---

**Dokumentasi diupdate**: 12 Februari 2026  
**Versi**: 2.0.0  
**Maintainer**: Backend SIKP Team
