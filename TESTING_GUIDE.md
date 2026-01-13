# 📋 Panduan Testing Backend SIKP dengan Postman

## 📥 Setup Postman

### 1. Import Collection
1. Buka Postman
2. Klik **Import** (pojok kiri atas)
3. Pilih file `postman_collection.json`
4. Collection akan muncul dengan nama **"Backend SIKP API"**

### 2. Setup Environment (Optional)
Anda bisa membuat environment baru atau menggunakan collection variables yang sudah ada:
- `baseUrl`: http://localhost:8787
- `mahasiswaToken`: (akan terisi otomatis)
- `mahasiswa2Token`: (akan terisi otomatis)
- `adminToken`: (akan terisi otomatis)
- `teamId`: (akan terisi otomatis)
- `memberId`: (akan terisi otomatis)
- `submissionId`: (akan terisi otomatis)

---

## 🎯 Skenario Testing Lengkap

### ✅ **Fase 1: Health Check**

#### Step 1.1: Test API Running
```
GET /
```
**Expected Response:**
```json
{
  "success": true,
  "message": "Backend SIKP API is running",
  "version": "1.0.0",
  "timestamp": "2026-01-12T..."
}
```

---

### 🔐 **Fase 2: Authentication & User Registration**

#### Step 2.1: Register Mahasiswa 1 (Leader)
```
POST /api/auth/register
```
**Body:**
```json
{
  "nim": "2021001",
  "name": "Budi Santoso",
  "email": "budi.santoso@student.univ.ac.id",
  "password": "password123"
}
```

**Expected:**
- Status: `201 Created`
- Response berisi `token` (auto-save ke variable)
- Role: `MAHASISWA`

**✅ Verification:** Token tersimpan di `mahasiswaToken`

---

#### Step 2.2: Register Mahasiswa 2 (Member)
```
POST /api/auth/register
```
**Body:**
```json
{
  "nim": "2021002",
  "name": "Siti Nurhaliza",
  "email": "siti.nurhaliza@student.univ.ac.id",
  "password": "password123"
}
```

**Expected:**
- Status: `201 Created`
- Token tersimpan di `mahasiswa2Token`

---

#### Step 2.3: Register Admin
```
POST /api/auth/register
```
**Body:**
```json
{
  "nim": "ADMIN001",
  "name": "Dr. Andi Wijaya",
  "email": "andi.wijaya@univ.ac.id",
  "password": "admin123",
  "role": "ADMIN"
}
```

**Expected:**
- Status: `201 Created`
- Role: `ADMIN`
- Token tersimpan di `adminToken`

---

#### Step 2.4: Test Login
```
POST /api/auth/login
```
**Body:**
```json
{
  "nim": "2021001",
  "password": "password123"
}
```

**Expected:**
- Status: `200 OK`
- Response berisi user info + token

---

#### Step 2.5: Get Profile
```
GET /api/auth/me
Header: Authorization: Bearer {{mahasiswaToken}}
```

**Expected:**
- Status: `200 OK`
- Response berisi user info (tanpa password)

**❌ Test Unauthorized:** Hapus Authorization header → 401 Unauthorized

---

### 👥 **Fase 3: Team Management**

#### Step 3.1: Create Team (sebagai Leader)
```
POST /api/teams
Header: Authorization: Bearer {{mahasiswaToken}}
```
**Body:**
```json
{
  "name": "Tim KP PT. Tech Indonesia 2024"
}
```

**Expected:**
- Status: `201 Created`
- `teamId` auto-saved
- Team status: `PENDING`
- Leader otomatis menjadi member dengan status `ACCEPTED`

---

#### Step 3.2: Get My Teams
```
GET /api/teams/my-teams
Header: Authorization: Bearer {{mahasiswaToken}}
```

**Expected:**
- Status: `200 OK`
- Array berisi tim yang dibuat

---

#### Step 3.3: Invite Member
```
POST /api/teams/{{teamId}}/invite
Header: Authorization: Bearer {{mahasiswaToken}}
```
**Body:**
```json
{
  "memberNim": "2021002"
}
```

**Expected:**
- Status: `201 Created`
- `memberId` auto-saved
- Invitation status: `PENDING`

**❌ Test Invalid NIM:**
```json
{"memberNim": "9999999"}
```
Expected: 400/404 - User not found

---

#### Step 3.4: Get Team Members
```
GET /api/teams/{{teamId}}/members
Header: Authorization: Bearer {{mahasiswaToken}}
```

**Expected:**
- 2 members: Leader (ACCEPTED) + Invited Member (PENDING)

---

#### Step 3.5: Accept Invitation (sebagai Member)
```
POST /api/teams/invitations/{{memberId}}/respond
Header: Authorization: Bearer {{mahasiswa2Token}}
```
**Body:**
```json
{
  "accept": true
}
```

**Expected:**
- Status: `200 OK`
- Member status: `ACCEPTED`
- Team status berubah ke `FIXED` (karena semua member accepted)

**🔄 Alternative Test - Reject:**
```json
{"accept": false}
```
Expected: Status `REJECTED`, team tetap `PENDING`

---

#### Step 3.6: Verify Team is FIXED
```
GET /api/teams/{{teamId}}/members
Header: Authorization: Bearer {{mahasiswaToken}}
```

**Expected:**
- All members status: `ACCEPTED`
- Team status: `FIXED`

---

### 📝 **Fase 4: Submission Management**

#### Step 4.1: Create Submission (DRAFT)
```
POST /api/submissions
Header: Authorization: Bearer {{mahasiswaToken}}
```
**Body:**
```json
{
  "teamId": "{{teamId}}"
}
```

**Expected:**
- Status: `201 Created`
- `submissionId` auto-saved
- Submission status: `DRAFT`
- Company fields kosong

**⚠️ PENTING:** Pastikan request body berisi field `teamId` dengan value yang valid!

**❌ Test with Invalid Request:**
- Empty body `{}` → 400 Bad Request: "Validation failed"
- Missing teamId → 400 Bad Request
- PENDING Team → 400: "Team must be fixed before creating submission"

---

#### Step 4.2: Update Submission Data
```
PATCH /api/submissions/{{submissionId}}
Header: Authorization: Bearer {{mahasiswaToken}}
```
**Body:**
```json
{
  "companyName": "PT. Technology Indonesia",
  "companyAddress": "Jl. Sudirman No. 123, Jakarta Pusat, DKI Jakarta 10220",
  "companyPhone": "021-12345678",
  "companyEmail": "hr@techindonesia.com",
  "companySupervisor": "Bapak Agus Setiawan",
  "position": "Backend Developer Intern",
  "startDate": "2024-03-01",
  "endDate": "2024-06-01",
  "description": "Kerja praktik di divisi pengembangan backend"
}
```

**Expected:**
- Status: `200 OK`
- All fields updated
- Status tetap `DRAFT`

---

#### Step 4.3: Get Submission Detail
```
GET /api/submissions/{{submissionId}}
Header: Authorization: Bearer {{mahasiswaToken}}
```

**Expected:**
- Status: `200 OK`
- Data lengkap submission

---

#### Step 4.4: Upload Document - KTP
```
POST /api/submissions/{{submissionId}}/documents
Header: Authorization: Bearer {{mahasiswaToken}}
Content-Type: multipart/form-data
```
**Form Data:**
- `file`: [Upload PDF file - KTP.pdf]
- `documentType`: KTP

**Expected:**
- Status: `201 Created`
- Document info dengan URL

**📝 Note:** Siapkan file dummy PDF untuk testing (bisa file PDF apa saja, rename jadi KTP.pdf)

---

#### Step 4.5: Upload Document - TRANSKRIP
```
POST /api/submissions/{{submissionId}}/documents
```
**Form Data:**
- `file`: [Upload PDF file - Transkrip.pdf]
- `documentType`: TRANSKRIP

---

#### Step 4.6: Get Documents List
```
GET /api/submissions/{{submissionId}}/documents
Header: Authorization: Bearer {{mahasiswaToken}}
```

**Expected:**
- Array of documents (KTP, TRANSKRIP)

---

#### Step 4.7: Submit for Review
```
POST /api/submissions/{{submissionId}}/submit
Header: Authorization: Bearer {{mahasiswaToken}}
```

**Expected:**
- Status: `200 OK`
- Submission status: `MENUNGGU`
- `submittedAt` timestamp added

**❌ Test Incomplete Data:**
- Create new submission
- Submit without filling companyName → Error: "Company name and address are required"

---

#### Step 4.8: Get My Submissions
```
GET /api/submissions/my-submissions
Header: Authorization: Bearer {{mahasiswaToken}}
```

**Expected:**
- Array berisi submissions dari tim user

---

### 👨‍💼 **Fase 5: Admin - Review & Approval**

#### Step 5.1: Get All Submissions (Admin)
```
GET /api/admin/submissions
Header: Authorization: Bearer {{adminToken}}
```

**Expected:**
- Status: `200 OK`
- Array semua submissions

**❌ Test Unauthorized:**
- Gunakan `mahasiswaToken` → 403 Forbidden

---

#### Step 5.2: Get Pending Submissions
```
GET /api/admin/submissions/status/MENUNGGU
Header: Authorization: Bearer {{adminToken}}
```

**Expected:**
- Hanya submissions dengan status `MENUNGGU`

**🔄 Try Other Status:**
- `/status/DRAFT`
- `/status/DITERIMA`
- `/status/DITOLAK`

---

#### Step 5.3: Get Submission Detail (Admin View)
```
GET /api/admin/submissions/{{submissionId}}
Header: Authorization: Bearer {{adminToken}}
```

**Expected:**
- Status: `200 OK`
- Full submission data
- Documents array
- Letters array (jika ada)

---

#### Step 5.4: Scenario A - Approve Submission
```
POST /api/admin/submissions/{{submissionId}}/approve
Header: Authorization: Bearer {{adminToken}}
```
**Body:**
```json
{
  "autoGenerateLetter": true
}
```

**Expected:**
- Status: `200 OK`
- Submission status: `DITERIMA`
- `approvedBy`: admin user ID
- `approvedAt`: timestamp
- Letter auto-generated (jika `autoGenerateLetter: true`)

**✅ Verification:**
1. Get submission detail → status `DITERIMA`
2. Check letters array → ada 1 letter

---

#### Step 5.5: Scenario B - Reject Submission
**(Skip jika sudah approve di Step 5.4)**

```
POST /api/admin/submissions/{{submissionId}}/reject
Header: Authorization: Bearer {{adminToken}}
```
**Body:**
```json
{
  "reason": "Dokumen tidak lengkap. Mohon upload KRS dan Proposal."
}
```

**Expected:**
- Status: `200 OK`
- Submission status: `DITOLAK`
- `rejectionReason`: reason dari request
- `approvedBy`: admin user ID

**❌ Test Empty Reason:**
```json
{"reason": ""}
```
Expected: 400 - Rejection reason is required

---

#### Step 5.6: Generate Letter Manually
**(Hanya jika approved tapi letter belum di-generate)**

```
POST /api/admin/submissions/{{submissionId}}/generate-letter
Header: Authorization: Bearer {{adminToken}}
```
**Body:**
```json
{
  "format": "pdf"
}
```

**Expected:**
- Status: `201 Created`
- Letter info dengan URL, letterNumber

**🔄 Test DOCX Format:**
```json
{"format": "docx"}
```

---

#### Step 5.7: Get Statistics
```
GET /api/admin/statistics
Header: Authorization: Bearer {{adminToken}}
```

**Expected:**
- Status: `200 OK`
- Statistics object:
```json
{
  "success": true,
  "message": "Statistics retrieved",
  "data": {
    "total": 1,
    "draft": 0,
    "pending": 0,
    "approved": 1,
    "rejected": 0
  }
}
```

---

## 🧪 Advanced Testing Scenarios

### Scenario 1: Complete Happy Path
1. Register 2 mahasiswa + 1 admin ✅
2. Mahasiswa 1 create team ✅
3. Invite Mahasiswa 2 ✅
4. Mahasiswa 2 accept invitation ✅
5. Create submission ✅
6. Update data perusahaan ✅
7. Upload 2+ dokumen ✅
8. Submit for review ✅
9. Admin approve + auto-generate letter ✅
10. Verify letter generated ✅

### Scenario 2: Rejection Flow
1. Follow steps 1-8 dari Scenario 1
2. Admin reject dengan reason
3. Mahasiswa lihat rejection reason
4. Create submission baru
5. Submit lagi
6. Admin approve

### Scenario 3: Authorization Testing
- ❌ Access admin endpoint dengan mahasiswa token → 403
- ❌ Access endpoint tanpa token → 401
- ❌ Update submission orang lain → 403
- ❌ Accept invitation untuk tim lain → 403

### Scenario 4: Validation Testing
- ❌ Submit submission tanpa company data → 400
- ❌ Upload file > 5MB → 400
- ❌ Upload file type selain PDF/DOCX → 400
- ❌ Invite member dengan NIM tidak ada → 404
- ❌ Create submission dengan team PENDING → 400

---

## 📊 Checklist Testing

### Authentication ✅
- [x] Register mahasiswa
- [x] Register admin
- [x] Login
- [x] Get profile
- [x] Invalid credentials
- [x] Unauthorized access

### Team Management ✅
- [x] Create team
- [x] Invite member
- [x] Accept invitation
- [x] Reject invitation
- [x] Team status FIXED when all accept
- [x] Get team members
- [x] Only leader can invite

### Submission Management ✅
- [x] Create submission (only FIXED team)
- [x] Update submission (only DRAFT)
- [x] Upload documents
- [x] Submit for review
- [x] Get my submissions
- [x] Validation required fields

### Admin Functions ✅
- [x] Get all submissions
- [x] Filter by status
- [x] Get submission detail
- [x] Approve submission
- [x] Reject submission
- [x] Generate letter
- [x] Get statistics
- [x] Only admin can access

---

## 🎯 Expected Results Summary

| Endpoint | Role | Status | Expected Result |
|----------|------|--------|-----------------|
| POST /api/auth/register | - | 201 | User created + token |
| POST /api/auth/login | - | 200 | Token returned |
| POST /api/teams | MAHASISWA | 201 | Team created (PENDING) |
| POST /api/teams/:id/invite | MAHASISWA | 201 | Member invited |
| POST /api/teams/invitations/:id/respond | MAHASISWA | 200 | Status updated, team→FIXED |
| POST /api/submissions | MAHASISWA | 201 | Submission created (DRAFT) |
| PATCH /api/submissions/:id | MAHASISWA | 200 | Data updated |
| POST /api/submissions/:id/submit | MAHASISWA | 200 | Status→MENUNGGU |
| POST /api/admin/submissions/:id/approve | ADMIN | 200 | Status→DITERIMA + letter |
| POST /api/admin/submissions/:id/reject | ADMIN | 200 | Status→DITOLAK + reason |

---

## 🐛 Common Issues & Solutions

### Issue 1: Token not auto-saved
**Solution:** Check Postman Tests tab, script should be:
```javascript
if (pm.response.code === 201) {
    var jsonData = pm.response.json();
    pm.collectionVariables.set('mahasiswaToken', jsonData.data.token);
}
```

### Issue 2: 401 Unauthorized
**Solution:** 
- Check Authorization header format: `Bearer {{token}}`
- Verify token is saved in collection variables
- Try login again

### Issue 3: 403 Forbidden
**Solution:**
- Using wrong role (e.g., mahasiswa accessing admin endpoint)
- Use correct token for the role

### Issue 4: File upload fails
**Solution:**
- Ensure Content-Type is `multipart/form-data`
- File size < 5MB
- File type is PDF or DOCX

---

## 📝 Notes

1. **Order Matters:** Jalankan request sesuai urutan fase
2. **Auto Variables:** Collection sudah setup auto-save untuk ID dan token
3. **Multiple Runs:** Untuk test ulang, gunakan NIM berbeda atau clear database
4. **Real Files:** Siapkan file PDF dummy untuk testing upload

---

**Happy Testing! 🚀**
