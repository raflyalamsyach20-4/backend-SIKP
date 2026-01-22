# 🧪 Testing Guide - Backend SIKP dengan SSO Integration

> **Panduan lengkap untuk testing Backend SIKP yang terintegrasi dengan SSO UNSRI & Profile Service menggunakan Postman**

---

## 📋 Prerequisites

### 1. Services yang Harus Running

Pastikan ketiga service berikut sudah running sebelum testing:

| Service | Port | URL | Status Check |
|---------|------|-----|--------------|
| **Auth Service** | 8787 | http://localhost:8787 | `GET /health` |
| **Profile Service** | 8788 | http://localhost:8788 | `GET /health` |
| **Backend SIKP** | 8789 | http://localhost:8789 | `GET /health` |

**Start Services:**

```powershell
# Terminal 1 - Auth Service
cd ..\auth-backend-sso
npm run dev

# Terminal 2 - Profile Service
cd ..\profile-service
npm run dev

# Terminal 3 - Backend SIKP
cd ..\backend-sikp
npm run dev
```

### 2. Database Setup

Pastikan database sudah di-migrate:

```powershell
# Di folder backend-sikp
bun run db:migrate
```

### 3. Import Postman Collection

1. Buka Postman
2. Klik **Import** button
3. Pilih file: `postman/postman_collection_sso.json`
4. Collection akan muncul dengan nama **"Backend SIKP API (SSO Integrated)"**

---

## 🎯 Testing Flow

### ⚠️ PENTING: Urutan Testing

Testing **HARUS** dilakukan sesuai urutan ini karena ada dependency antar endpoint:

```
1. Health Check (opsional)
   ↓
2. Register & Login (Auth Service)
   ↓ (simpan access token)
3. Get User Info (Backend SIKP)
   ↓
4. Team Management
   ↓
5. Submission Management
   ↓
6. Admin Review & Approval
```

---

## 📝 Step-by-Step Testing

### Step 0: Health Check (Optional)

Verifikasi semua services running dengan baik.

**Requests:**
1. ✅ Auth Service Health → Expected: `{"status": "ok"}`
2. ✅ Profile Service Health → Expected: `{"status": "ok"}`
3. ✅ Backend SIKP Health → Expected: `{"status": "healthy"}`

---

### Step 1: Register Users (Auth Service)

Register 3 user untuk testing: 2 mahasiswa dan 1 admin.

#### 1.1 Register Mahasiswa 1 (Leader)

**Request:** `POST /api/auth/register` ke Auth Service

```json
{
  "email": "mahasiswa1@student.unsri.ac.id",
  "password": "Password123!",
  "role": "mahasiswa",
  "nim": "09021182025001"
}
```

**Expected Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "cuid...",
      "email": "mahasiswa1@student.unsri.ac.id",
      "name": "Nama Mahasiswa 1",
      "roles": ["mahasiswa"]
    }
  }
}
```

⚠️ **Note:** 
- NIM `09021182025001` harus sudah ada di **Profile Service**
- Field `name` akan otomatis diambil dari Profile Service

#### 1.2 Register Mahasiswa 2 (Member)

**Request:** `POST /api/auth/register` ke Auth Service

```json
{
  "email": "mahasiswa2@student.unsri.ac.id",
  "password": "Password123!",
  "role": "mahasiswa",
  "nim": "09021182025002"
}
```

#### 1.3 Register Admin

**Request:** `POST /api/auth/register` ke Auth Service

```json
{
  "email": "admin@unsri.ac.id",
  "password": "Admin123!",
  "role": "admin",
  "nip": "199001012020121001"
}
```

---

### Step 2: Login & Get Access Tokens

Login dengan setiap user untuk mendapatkan access token.

#### 2.1 Login Mahasiswa 1

**Request:** `POST /api/auth/login` ke Auth Service

```json
{
  "email": "mahasiswa1@student.unsri.ac.id",
  "password": "Password123!"
}
```

**Expected Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 86400
  }
}
```

✅ **Postman akan otomatis menyimpan token ke variable `mahasiswaToken`**

#### 2.2 Login Mahasiswa 2

**Request:** Sama seperti 2.1, ganti email/password

✅ **Token disimpan ke variable `mahasiswa2Token`**

#### 2.3 Login Admin

**Request:** Sama seperti 2.1, ganti email/password

✅ **Token disimpan ke variable `adminToken`**

---

### Step 3: Get User Info (Backend SIKP)

Test endpoint Backend SIKP untuk mendapatkan info user + profiles.

#### 3.1 Get My Info (Mahasiswa)

**Request:** `GET /api/auth/me` ke Backend SIKP

**Headers:**
```
Authorization: Bearer {{mahasiswaToken}}
```

**Expected Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "userId": "cuid...",
      "email": "mahasiswa1@student.unsri.ac.id",
      "name": "Nama Mahasiswa 1",
      "roles": ["mahasiswa"],
      "permissions": ["kp:submit", "team:manage"]
    },
    "profiles": [
      {
        "id": "profile-id",
        "authUserId": "cuid...",
        "nim": "09021182025001",
        "name": "Nama Mahasiswa 1",
        "email": "mahasiswa1@student.unsri.ac.id",
        "fakultas": "Fakultas Ilmu Komputer",
        "prodi": "Sistem Komputer",
        "semester": 6,
        "angkatan": "2020"
      }
    ]
  }
}
```

✅ **Verify:**
- User info dari JWT token
- Profiles dari Profile Service
- Role dan permissions sesuai

---

### Step 4: Team Management

Test flow pembuatan team dan invite member.

#### 4.1 Create Team (as Leader/Mahasiswa 1)

**Request:** `POST /api/teams` ke Backend SIKP

**Headers:**
```
Authorization: Bearer {{mahasiswaToken}}
```

**Body:** (empty or {})

**Expected Response (201):**
```json
{
  "success": true,
  "message": "Team created successfully",
  "data": {
    "id": "team-cuid",
    "code": "SIKP-ABC123",
    "leaderId": "user-cuid",
    "status": "PENDING",
    "members": [
      {
        "id": "member-cuid",
        "userId": "user-cuid",
        "invitationStatus": "ACCEPTED",
        "profile": {
          "nim": "09021182025001",
          "name": "Nama Mahasiswa 1"
        }
      }
    ]
  }
}
```

✅ **Postman akan menyimpan `team.id` ke variable `teamId`**

#### 4.2 Get My Team

**Request:** `GET /api/teams/my-team` ke Backend SIKP

**Expected Response (200):**
- Team detail dengan members
- Profile lengkap setiap member dari Profile Service

#### 4.3 Invite Member (by NIM)

**Request:** `POST /api/teams/{{teamId}}/invite` ke Backend SIKP

**Headers:**
```
Authorization: Bearer {{mahasiswaToken}}
```

**Body:**
```json
{
  "memberNim": "09021182025002"
}
```

**Expected Response (201):**
```json
{
  "success": true,
  "message": "Member invited successfully",
  "data": {
    "id": "invitation-cuid",
    "teamId": "team-cuid",
    "userId": "user-cuid-mahasiswa2",
    "invitationStatus": "PENDING",
    "profile": {
      "nim": "09021182025002",
      "name": "Nama Mahasiswa 2"
    }
  }
}
```

✅ **Postman akan menyimpan `invitation.id` ke variable `invitationId`**

#### 4.4 Get My Invitations (as Mahasiswa 2)

**Request:** `GET /api/teams/my-invitations` ke Backend SIKP

**Headers:**
```
Authorization: Bearer {{mahasiswa2Token}}
```

**Expected Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "invitation-cuid",
      "teamId": "team-cuid",
      "team": {
        "code": "SIKP-ABC123",
        "leader": {
          "nim": "09021182025001",
          "name": "Nama Mahasiswa 1"
        }
      },
      "invitationStatus": "PENDING"
    }
  ]
}
```

#### 4.5 Accept Invitation (as Mahasiswa 2)

**Request:** `PATCH /api/teams/members/{{invitationId}}/respond` ke Backend SIKP

**Headers:**
```
Authorization: Bearer {{mahasiswa2Token}}
```

**Body:**
```json
{
  "action": "ACCEPT"
}
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Invitation accepted"
}
```

#### 4.6 Leave Team (as Mahasiswa 2) - Optional

**Request:** `DELETE /api/teams/leave` ke Backend SIKP

**Headers:**
```
Authorization: Bearer {{mahasiswa2Token}}
```

#### 4.7 Cancel Invitation (as Leader) - Optional

**Request:** `DELETE /api/teams/invitations/{{invitationId}}/cancel` ke Backend SIKP

**Headers:**
```
Authorization: Bearer {{mahasiswaToken}}
```

---

### Step 5: Submission Management

Test flow pembuatan dan submit pengajuan KP.

#### 5.1 Create Submission (as Leader)

**Request:** `POST /api/submissions` ke Backend SIKP

**Headers:**
```
Authorization: Bearer {{mahasiswaToken}}
```

**Body:**
```json
{
  "companyName": "PT Telkom Indonesia",
  "companyAddress": "Jl. Jend. Sudirman No. 1, Palembang",
  "companyPhone": "0711-123456",
  "companyEmail": "hrd@telkom.co.id",
  "companySupervisor": "Budi Santoso",
  "position": "Software Engineer Intern",
  "startDate": "2026-02-01",
  "endDate": "2026-05-01",
  "description": "Kerja praktik di divisi IT Development"
}
```

**Expected Response (201):**
```json
{
  "success": true,
  "message": "Submission created",
  "data": {
    "id": "submission-cuid",
    "teamId": "team-cuid",
    "companyName": "PT Telkom Indonesia",
    "status": "DRAFT",
    ...
  }
}
```

✅ **Postman akan menyimpan `submission.id` ke variable `submissionId`**

#### 5.2 Get My Submissions

**Request:** `GET /api/submissions/my-submissions` ke Backend SIKP

#### 5.3 Update Submission

**Request:** `PATCH /api/submissions/{{submissionId}}` ke Backend SIKP

**Body:**
```json
{
  "companyPhone": "0711-999888",
  "description": "Kerja praktik di divisi IT Development - Updated"
}
```

#### 5.4 Submit for Review

**Request:** `POST /api/submissions/{{submissionId}}/submit` ke Backend SIKP

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Submission submitted for review",
  "data": {
    "status": "MENUNGGU"
  }
}
```

---

### Step 6: Admin Review & Approval

Test admin endpoints untuk review dan approve submission.

#### 6.1 Get All Submissions (as Admin)

**Request:** `GET /api/admin/submissions` ke Backend SIKP

**Headers:**
```
Authorization: Bearer {{adminToken}}
```

**Expected Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "submission-cuid",
      "team": {
        "code": "SIKP-ABC123",
        "leader": {...}
      },
      "companyName": "PT Telkom Indonesia",
      "status": "MENUNGGU",
      ...
    }
  ]
}
```

#### 6.2 Get Submissions by Status

**Request:** `GET /api/admin/submissions/status/MENUNGGU` ke Backend SIKP

#### 6.3 Approve Submission

**Request:** `POST /api/admin/submissions/{{submissionId}}/approve` ke Backend SIKP

**Headers:**
```
Authorization: Bearer {{adminToken}}
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Submission approved",
  "data": {
    "status": "DITERIMA",
    "approvedBy": "admin-user-id",
    "approvedAt": "2026-01-22T..."
  }
}
```

#### 6.4 Reject Submission (Alternative)

**Request:** `POST /api/admin/submissions/{{submissionId}}/reject` ke Backend SIKP

**Body:**
```json
{
  "rejectionReason": "Data perusahaan tidak lengkap, mohon dilengkapi"
}
```

#### 6.5 Generate Letter

**Request:** `POST /api/admin/submissions/{{submissionId}}/generate-letter` ke Backend SIKP

#### 6.6 Get Statistics

**Request:** `GET /api/admin/statistics` ke Backend SIKP

---

## ✅ Testing Checklist

### Basic Flow
- [ ] All services health check passed
- [ ] Register 3 users successfully
- [ ] Login 3 users and get tokens
- [ ] Get user info with profiles

### Team Flow
- [ ] Create team as leader
- [ ] Invite member by NIM
- [ ] Member receive invitation
- [ ] Member accept invitation
- [ ] Get team with all members + profiles

### Submission Flow
- [ ] Create submission as leader
- [ ] Update submission
- [ ] Submit for review (status: MENUNGGU)

### Admin Flow
- [ ] Admin can see all submissions
- [ ] Admin can filter by status
- [ ] Admin can approve submission
- [ ] Admin can generate letter
- [ ] Admin can view statistics

### Authorization Tests
- [ ] Mahasiswa can't access admin endpoints (403)
- [ ] Admin can't create team (403)
- [ ] Non-leader can't invite members (403)
- [ ] Expired/invalid token returns 401

---

## 🐛 Common Issues & Troubleshooting

### Issue: "No token provided" (401)

**Cause:** Token belum di-set atau salah format

**Solution:**
1. Pastikan sudah login dan dapat access token
2. Check collection variable: `{{mahasiswaToken}}`, `{{adminToken}}`
3. Verify header format: `Authorization: Bearer <token>`

### Issue: "Forbidden" (403)

**Cause:** User tidak punya permission/role yang sesuai

**Solution:**
1. Check user role di response `/api/auth/me`
2. Pastikan menggunakan token yang sesuai (mahasiswa/admin)
3. Verify permissions di JWT token

### Issue: "NIM not found" saat register

**Cause:** NIM belum ada di Profile Service

**Solution:**
1. Pastikan Profile Service running
2. Check apakah NIM sudah di-seed di Profile Service
3. Gunakan NIM yang valid: `09021182025001`, `09021182025002`

### Issue: "Profile Service unavailable"

**Cause:** Profile Service tidak running atau URL salah

**Solution:**
1. Check Profile Service di http://localhost:8788/health
2. Verify `PROFILE_SERVICE_URL` di `.env` dan `wrangler.jsonc`
3. Restart Backend SIKP

### Issue: Team creation fails

**Cause:** User bukan mahasiswa atau belum punya profil

**Solution:**
1. Login dengan mahasiswa token
2. Verify profil ada di Profile Service
3. Check `/api/auth/me` untuk confirm profile

---

## 📊 Expected Results Summary

| Endpoint | Role | Expected Status | Notes |
|----------|------|-----------------|-------|
| `POST /api/teams` | Mahasiswa | 201 | Creates team with code |
| `POST /api/teams` | Admin | 403 | Forbidden |
| `GET /api/auth/me` | Any | 200 | Returns user + profiles |
| `POST /api/admin/submissions/*/approve` | Admin | 200 | Approves submission |
| `POST /api/admin/submissions/*/approve` | Mahasiswa | 403 | Forbidden |
| `DELETE /api/teams/leave` | Member | 200 | Leaves team |
| `DELETE /api/teams/leave` | Leader | 400 | Can't leave as leader |

---

## 🎓 Testing Best Practices

1. **Test in Order:** Always follow the testing flow sequence
2. **Save Variables:** Let Postman scripts save IDs automatically
3. **Check Responses:** Verify response structure and data
4. **Test Authorization:** Try accessing endpoints with wrong roles
5. **Clean State:** Reset database between test runs if needed
6. **Monitor Logs:** Check terminal logs for detailed errors

---

## 📞 Support

Jika menemukan issue atau ada pertanyaan:

1. Check [INTEGRASI_SSO.md](../INTEGRASI_SSO.md) untuk dokumentasi lengkap
2. Check [QUICK_START.md](../QUICK_START.md) untuk setup guide
3. Review [AUTH_INTEGRATION_GUIDE.md](../AUTH_INTEGRATION_GUIDE.md) untuk JWT flow

---

**Happy Testing! 🚀**
