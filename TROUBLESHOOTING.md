# 🔧 Troubleshooting Guide - Backend SIKP

## ✅ Fix Applied: POST /api/submissions Error

### Problem
```
POST /api/submissions 500 Internal Server Error
```

Error terjadi karena:
- Request body tidak memiliki field `teamId`
- Validation error tidak di-handle dengan baik
- Server mengembalikan 500 instead of 400

### Solution Applied
1. ✅ Mengubah `.parse()` menjadi `.safeParse()` untuk semua validation
2. ✅ Menambahkan explicit error handling untuk validation errors
3. ✅ Mengembalikan 400 Bad Request dengan detail error yang jelas

### Correct Request Format
```json
POST /api/submissions
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "teamId": "team_abc123xyz"
}
```

### Expected Responses

#### ✅ Success (201 Created)
```json
{
  "success": true,
  "message": "Submission created successfully",
  "data": {
    "id": "sub_xyz",
    "teamId": "team_abc123",
    "status": "DRAFT",
    "createdAt": "2026-01-13T..."
  }
}
```

#### ❌ Validation Error (400 Bad Request)
```json
{
  "success": false,
  "message": "Validation failed",
  "data": {
    "errors": [
      {
        "code": "invalid_type",
        "expected": "string",
        "received": "undefined",
        "path": ["teamId"],
        "message": "Required"
      }
    ]
  }
}
```

---

## 📋 Common Errors & Solutions

### 1. 400 Bad Request - "Validation failed"

**Cause:** Request body tidak sesuai schema validation

**Solutions:**
- ✅ Pastikan semua required fields ada di request body
- ✅ Check data type (string, number, boolean)
- ✅ Lihat detail error di field `data.errors`

**Example Fixes:**
```json
// ❌ Wrong - missing teamId
{}

// ✅ Correct
{
  "teamId": "team_abc123"
}
```

---

### 2. 401 Unauthorized

**Cause:** Token tidak ada atau invalid

**Solutions:**
- ✅ Pastikan header `Authorization: Bearer <token>` ada
- ✅ Login ulang untuk mendapatkan token baru
- ✅ Copy token dari response `/api/auth/login`

**Postman:**
1. Go to Authorization tab
2. Type: Bearer Token
3. Token: `{{mahasiswaToken}}` (auto-filled by collection)

---

### 3. 403 Forbidden

**Cause:** User tidak memiliki akses ke resource

**Common Cases:**
- Mahasiswa mencoba akses endpoint admin
- User bukan member dari team
- User bukan leader saat invite member

**Solutions:**
- ✅ Gunakan token dengan role yang sesuai
- ✅ Verify team membership dengan GET `/api/teams/my-teams`
- ✅ Check user role dengan GET `/api/auth/me`

---

### 4. 404 Not Found

**Cause:** Resource dengan ID tersebut tidak ada

**Common Cases:**
- Team ID tidak ditemukan
- Submission ID salah
- User NIM tidak ada di database

**Solutions:**
- ✅ Verify ID dengan GET request sebelum POST/PATCH
- ✅ Copy ID dari variable Postman ({{teamId}}, {{submissionId}})
- ✅ Check apakah resource sudah di-create

---

### 5. 400 - "Team must be fixed before creating submission"

**Cause:** Team masih status PENDING (ada member yang belum accept invitation)

**Solutions:**
1. ✅ Check team status: GET `/api/teams/{{teamId}}/members`
2. ✅ Pastikan semua member sudah `ACCEPTED`
3. ✅ Jika ada PENDING, minta member untuk accept:
   ```
   POST /api/teams/invitations/{{memberId}}/respond
   Body: { "accept": true }
   ```
4. ✅ Team otomatis jadi FIXED setelah semua member accept

---

### 6. 400 - "User is not a member of this team"

**Cause:** User mencoba akses submission dari team yang bukan miliknya

**Solutions:**
- ✅ Verify team membership: GET `/api/teams/my-teams`
- ✅ Gunakan token dari user yang merupakan member
- ✅ Check submission.teamId sesuai dengan team user

---

### 7. 400 - "Can only update draft submissions"

**Cause:** Submission sudah di-submit (status MENUNGGU/DITERIMA/DITOLAK)

**Solutions:**
- ✅ Check submission status: GET `/api/submissions/{{submissionId}}`
- ✅ Hanya submission dengan status `DRAFT` yang bisa diupdate
- ✅ Jika sudah DITOLAK, create submission baru

---

### 8. File Upload Errors

#### "No file provided"
- ✅ Pastikan field name adalah `file` (bukan `document`, `upload`, etc.)
- ✅ Type: File (bukan Text)
- ✅ Select file dari filesystem

#### "File size exceeds limit"
- ✅ Maximum file size: 5MB
- ✅ Compress file jika terlalu besar
- ✅ Upload per file, jangan batch

#### "Invalid file type"
- ✅ Allowed types: PDF, DOCX, DOC
- ✅ Check file extension
- ✅ Rename jika perlu (.pdf, .docx)

#### "Invalid document type"
- ✅ documentType harus salah satu dari:
  - KTP
  - TRANSKRIP
  - KRS
  - PROPOSAL
  - OTHER
- ✅ Case-sensitive (gunakan huruf kapital)

**Postman Setup:**
```
POST /api/submissions/{{submissionId}}/documents
Content-Type: multipart/form-data

Form Data:
- file: [Select File] → KTP.pdf
- documentType: KTP (Text field)
```

---

## 🔍 Debugging Steps

### 1. Check Server Status
```bash
# Pastikan server running
npm run dev

# Expected output:
# ⎔ Starting local server...
# [wrangler:inf] Ready on http://127.0.0.1:8787
```

### 2. Test Health Endpoint
```bash
GET http://localhost:8787/health

# Expected:
# Status: 200 OK
# Body: { "success": true, ... }
```

### 3. Verify Token
```bash
GET http://localhost:8787/api/auth/me
Authorization: Bearer <your-token>

# Expected:
# Status: 200 OK
# Body: { "success": true, "data": { "id": ..., "role": ... } }
```

### 4. Check Postman Variables
1. Click Collection → Variables tab
2. Verify these variables have values:
   - baseUrl: `http://localhost:8787`
   - mahasiswaToken: `eyJhbG...` (JWT token)
   - teamId: `team_...`
   - submissionId: `sub_...`

### 5. Enable Verbose Logging
Check Wrangler terminal untuk error details:
```
[wrangler:inf] POST /api/submissions 400 Bad Request (5ms)
```

---

## 🎯 Request Flow Checklist

### Creating Submission - Complete Flow

#### ✅ Step 1: Register/Login
```
POST /api/auth/register
→ Save token
```

#### ✅ Step 2: Create Team
```
POST /api/teams
Body: { "name": "Tim KP 2024" }
→ Save teamId
```

#### ✅ Step 3: Verify Team Status
```
GET /api/teams/{{teamId}}/members
→ Check: all members ACCEPTED & team status FIXED
```

#### ✅ Step 4: Create Submission
```
POST /api/submissions
Body: { "teamId": "{{teamId}}" }
→ Save submissionId
```

#### ✅ Step 5: Update Data
```
PATCH /api/submissions/{{submissionId}}
Body: { companyName, companyAddress, ... }
```

#### ✅ Step 6: Upload Documents
```
POST /api/submissions/{{submissionId}}/documents
Form: file + documentType
```

#### ✅ Step 7: Submit for Review
```
POST /api/submissions/{{submissionId}}/submit
```

---

## 🚨 Quick Fixes

### Reset Everything
```sql
-- Clear all data (development only!)
DELETE FROM generated_letters;
DELETE FROM submission_documents;
DELETE FROM submissions;
DELETE FROM team_members;
DELETE FROM teams;
DELETE FROM users;
```

### Generate New Token
```
POST /api/auth/login
Body: { "nim": "2021001", "password": "password123" }
```

### Re-invite Team Member
```
# 1. Delete old invitation
# (not implemented yet - just create new team)

# 2. Create new team
POST /api/teams
Body: { "name": "New Team" }

# 3. Invite again
POST /api/teams/{{teamId}}/invite
Body: { "memberNim": "2021002" }
```

---

## 📞 Need Help?

### Check These First:
1. ✅ Server running? → Check terminal
2. ✅ Request body correct? → Check JSON format
3. ✅ Token valid? → GET /api/auth/me
4. ✅ Team status FIXED? → GET /api/teams/{{teamId}}/members
5. ✅ Variables set? → Check Postman Variables tab

### Error Message Format
Semua error response mengikuti format:
```json
{
  "success": false,
  "message": "Error description",
  "data": {
    "errors": [/* Zod validation errors */]
  }
}
```

### Log Files
Check Wrangler console untuk detailed error stack trace.

---

**Last Updated:** 2026-01-13  
**Status:** ✅ All validation errors fixed
