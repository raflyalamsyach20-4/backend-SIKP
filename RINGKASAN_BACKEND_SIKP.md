# RINGKASAN BACKEND SIKP

Dokumen ini adalah ringkasan teknis backend SIKP berdasarkan implementasi kode saat ini di folder src dan schema database Drizzle.

## 1. Ruang Lingkup

- Fokus pada endpoint utama dan aktif yang dipakai alur utama sistem.
- Endpoint fallback kompatibilitas lama tidak dimasukkan ke katalog utama.
- Source of truth adalah kode backend, bukan README.
- Mencakup:
  - Arsitektur backend.
  - Fitur dan alur proses bisnis.
  - Model data inti dan status workflow.
  - Katalog endpoint utama berikut request dan response.

## 2. Gambaran Arsitektur

### 2.1 Stack

- Runtime: Cloudflare Workers.
- Framework HTTP: Hono.
- Database: PostgreSQL (Neon) + Drizzle ORM.
- Storage file: Cloudflare R2.
- Auth: JWT + bcrypt.
- Validasi: Zod.

### 2.2 Struktur Layer

- routes: definisi method dan path endpoint.
- controllers: parsing request, validasi, status code, response.
- services: business logic dan alur proses.
- repositories: query ke database.
- db/schema: definisi tabel, enum, relasi.
- middlewares: auth middleware dan role middleware.

### 2.3 Flow Request

1. Request masuk ke Hono app.
2. Middleware global: logger dan cors.
3. Untuk prefix /api, DIContainer dibangun per request.
4. Route spesifik dipanggil.
5. Middleware auth/role memvalidasi akses.
6. Controller memvalidasi payload dan panggil service.
7. Service memproses bisnis dan akses repository/storage.
8. Response dikirim dalam format JSON standar.

### 2.4 Format Response

Format standar helper createResponse:

- success: boolean.
- message: string.
- data: payload (opsional).

Catatan penting:

- Mayoritas endpoint mengikuti format standar.
- Beberapa endpoint mengembalikan bentuk khusus, contoh join team mengembalikan object service langsung (tetap berisi success/message/data).
- Error default ditangani handleError dengan statusCode dari error jika ada, fallback ke 500.

## 3. RBAC dan Middleware

### 3.1 Role

- MAHASISWA.
- ADMIN.
- KAPRODI.
- WAKIL_DEKAN.
- DOSEN.
- PEMBIMBING_LAPANGAN.

### 3.2 Middleware Inti

- authMiddleware:
  - Membaca Authorization Bearer token.
  - Verifikasi JWT.
  - Menaruh user payload ke context.
- roleMiddleware(allowedRoles):
  - Memastikan role user termasuk allowed roles.

Shortcut middleware:

- mahasiswaOnly: MAHASISWA.
- adminOnly: ADMIN, KAPRODI, WAKIL_DEKAN.
- dosenOnly: DOSEN.

Catatan implementasi:

- Di beberapa controller ada guard tambahan yang lebih ketat dari route middleware.
- Contoh template dan response letter admin secara route bisa adminOnly, tetapi controller memeriksa role harus ADMIN.

## 4. Model Data Inti

### 4.1 Tabel Utama

- users: data user global dan role.
- mahasiswa, admin, dosen, pembimbing_lapangan: profile per role.
- teams: data tim KP.
- team_members: anggota tim + invitation status.
- submissions: pengajuan KP utama.
- submission_documents: dokumen per submission.
- generated_letters: surat hasil generate.
- templates: template dokumen.
- response_letters: surat balasan perusahaan.
- surat_kesediaan_requests: alur surat kesediaan dosen.
- surat_permohonan_requests: alur surat permohonan dosen.

### 4.2 Enum Penting

- team_status: PENDING, FIXED.
- invitation_status: PENDING, ACCEPTED, REJECTED.
- submission_status: DRAFT, PENDING_REVIEW, APPROVED, REJECTED.
- workflow_stage:
  - DRAFT.
  - PENDING_ADMIN_REVIEW.
  - PENDING_DOSEN_VERIFICATION.
  - COMPLETED.
  - REJECTED_ADMIN.
  - REJECTED_DOSEN.
- submission_verification_status: PENDING, APPROVED, REJECTED.
- document_type:
  - PROPOSAL_KETUA.
  - SURAT_KESEDIAAN.
  - FORM_PERMOHONAN.
  - KRS_SEMESTER_4.
  - DAFTAR_KUMPULAN_NILAI.
  - BUKTI_PEMBAYARAN_UKT.
  - SURAT_PENGANTAR.
- document_status: PENDING, APPROVED, REJECTED.
- letter_status: approved, rejected.
- response_letter_status: pending, submitted, verified.

### 4.3 Workflow Submission

Alur utama submission:

1. DRAFT.
2. PENDING_ADMIN_REVIEW.
3. PENDING_DOSEN_VERIFICATION.
4. COMPLETED.

Alur penolakan:

- REJECTED_ADMIN atau REJECTED_DOSEN.
- Dapat reset ke DRAFT dengan endpoint reset.

## 5. Fitur Utama dan Alur Bisnis

### 5.1 Autentikasi dan Onboarding

- Registrasi MAHASISWA, ADMIN/KAPRODI/WAKIL_DEKAN, DOSEN.
- Login berbasis email/password.
- JWT payload berisi userId, email, role, plus nim/nip sesuai role.

### 5.2 Profil Mahasiswa dan Dosen

- Lihat profil diri.
- Update profil dasar.
- Upload/hapus e-signature.
- E-signature dipakai untuk proses penandatanganan surat tertentu.

### 5.3 Manajemen Tim

- Mahasiswa membuat tim.
- Ketua mengundang anggota berdasarkan NIM.
- Anggota merespon undangan.
- Finalisasi tim mengubah status ke FIXED.
- Team reset tersedia untuk memulai ulang proses setelah kondisi tertentu.

### 5.4 Pengajuan Submission KP

- Buat submission (draft) untuk tim FIXED.
- Update data perusahaan dan periode KP.
- Upload dokumen persyaratan.
- Submit ke admin review.
- Admin review per dokumen lalu approve/reject.
- Setelah admin approve, masuk ke verifikasi dosen.

### 5.5 Verifikasi Dosen Surat Pengantar

- Queue dosen membaca submission tahap PENDING_DOSEN_VERIFICATION.
- Dosen dapat approve atau reject.
- Approve akan memfinalisasi submission dan menghasilkan final signed file URL.

### 5.6 Template Dokumen

- Read template aktif dan daftar template.
- ADMIN dapat create/update/delete/toggle active template.
- Download template tersedia.

### 5.7 Surat Balasan Perusahaan

- Mahasiswa upload surat balasan (PDF).
- Admin verifikasi surat balasan.
- Jika approved: responseLetterStatus submission ke verified.
- Jika rejected: reset tim tidak otomatis, menunggu aksi manual mahasiswa.

### 5.8 Surat Kesediaan dan Surat Permohonan

- Mahasiswa ajukan request ke dosen.
- Dosen approve/reject single atau bulk.
- Sistem menghasilkan signed PDF dari workflow tersebut.
- Request yang ditolak dapat diajukan ulang.

## 6. Katalog Endpoint Utama

Catatan pembacaan tabel:

- Semua response sukses memakai pola success, message, data, kecuali endpoint tertentu yang disebutkan khusus.
- Kolom Error utama berisi status code paling penting berdasarkan implementasi controller/service saat ini.

---

## 6.1 Auth

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| POST | /api/auth/register/mahasiswa | Public | JSON: nim string min 1, nama string min 1, email email max 255, password string min 6, fakultas optional, prodi optional, semester int positive optional, jumlahSksSelesai int nonnegative optional, angkatan optional, phone optional max 20 | 201, data.user: id, nama, email, role, nim, fakultas, prodi, jumlahSksSelesai; data.token string | 400 validation, 409 duplicate nim/email, 500 |
| POST | /api/auth/register/admin | Public | JSON: nip string min 1, nama string min 1, email, password min 6, role enum ADMIN/KAPRODI/WAKIL_DEKAN, fakultas optional, prodi optional, phone optional | 201, data.user: id, nama, email, role, nip, fakultas, prodi; data.token | 400, 409, 500 |
| POST | /api/auth/register/dosen | Public | JSON: nip string min 1, nama string min 1, email, password min 6, jabatan optional, fakultas optional, prodi optional, phone optional | 201, data.user: id, nama, email, role DOSEN, nip, jabatan, fakultas, prodi; data.token | 400, 409, 500 |
| POST | /api/auth/login | Public | JSON: email valid, password string min 1 | 200, data.user (base user + profile role), data.token | 401 invalid credentials, 500 |
| GET | /api/auth/me | Bearer | Tanpa body | 200, data berisi payload JWT user | 401 unauthorized |

---

## 6.2 Mahasiswa Profile dan Search

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| GET | /api/mahasiswa/dashboard | MAHASISWA | - | 200, data dashboard: kerjaPraktik, hariTersisa, tahapBerikutnya, statusPengajuan, teamInfo, activities | 401, 403, 500 |
| GET | /api/mahasiswa/me | MAHASISWA | - | 200, data: id, nama, email, phone, nim, fakultas, prodi, semester, jumlahSksSelesai, angkatan, esignature object atau null | 404 profile not found, 500 |
| PUT | /api/mahasiswa/me/profile | MAHASISWA | JSON optional: nama max 255, email, phone max 20, fakultas nullable max 100, prodi nullable max 100, semester nullable int positive, jumlahSksSelesai nullable int nonnegative, angkatan nullable max 10; minimal 1 field harus ada | 200, data profil terbaru dengan struktur sama seperti endpoint me | 400 validation, 500 |
| PUT | /api/mahasiswa/me/esignature | MAHASISWA | multipart/form-data: signatureFile File png/jpg/jpeg, max 2 MB | 200, data: url, key, uploadedAt | 400 file invalid, 500 |
| DELETE | /api/mahasiswa/me/esignature | MAHASISWA | - | 200, data null | 500 |
| GET | /api/mahasiswa/search | Bearer | Query: q string minimal 2 karakter | 200, data array hasil pencarian mahasiswa | 400 q kosong/terlalu pendek, 500 |
| GET | /api/mahasiswa/submissions/:submissionId/letter-request-status | MAHASISWA | Path param: submissionId | 200, data array status surat per member dan per jenis dokumen: memberUserId, documentType, isAlreadySubmitted, latestStatus, latestRequestId, dosenName, signedFileUrl, rejectionReason, submittedAt | 403, 404, 500 |

---

## 6.3 Tim KP

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| POST | /api/teams | MAHASISWA | JSON kosong | 201, data team: id, code, leaderId, dosenKpId, status PENDING | 403, 422 dosen PA belum ada, 500 |
| GET | /api/teams/my-teams | MAHASISWA | - | 200, data array team dengan members detail: role, status invitation, user info | 500 |
| GET | /api/teams/my-invitations | MAHASISWA | - | 200, data array invitation: id, teamId, status, team info, inviter info | 500 |
| POST | /api/teams/:teamId/invite | MAHASISWA | Path param teamId; JSON: memberNim string min 1 | 201, data invitation team member | 400, 403, 404 |
| POST | /api/teams/invitations/:memberId/respond | MAHASISWA | Path param memberId; JSON: accept boolean | 200, data: success, status ACCEPTED/REJECTED, member updated | 403, 404 |
| POST | /api/teams/invitations/:memberId/cancel | MAHASISWA | Path param memberId | 200, data: success, cancelledInvitationId, cancelledUserId, teamId | 400, 403, 404 |
| POST | /api/teams/:teamCode/join | MAHASISWA | Path param teamCode | 201, response khusus dari service: success, message, data { memberId, teamId, teamCode, userId, status PENDING, createdAt, team { id, code, leaderName, leaderNim } } | 400, 404 |
| GET | /api/teams/:teamId/members | MAHASISWA | Path param teamId | 200, data array member detail + user info | 404 |
| POST | /api/teams/:teamId/finalize | MAHASISWA | Path param teamId | 200, data: id, code, status FIXED, message, submission draft, submissionAlreadyExists | 403, 422, 500 |
| POST | /api/teams/:teamId/leave | MAHASISWA | Path param teamId | 200, data: success true, message, teamId | 403, 404 |
| POST | /api/teams/:teamId/members/:memberId/remove | MAHASISWA | Path param teamId, memberId | 200, data: success, message, removedMemberId, teamId | 400, 403, 404 |
| POST | /api/teams/:teamId/delete | MAHASISWA | Path param teamId | 200, data: deletedTeamId, deletedTeamCode, membersAffected | 400, 403, 404 |
| POST | /api/teams/reset | MAHASISWA | - | 200, data hasil reset tim dari TeamResetService | 404 jika user tidak punya tim, 500 |

---

## 6.4 Submission

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| POST | /api/submissions | MAHASISWA | JSON: teamId wajib; optional letterPurpose, companyName, companyAddress, companyPhone max 50 regex nomor 6-50 char, companyBusinessType 2-255 jika diisi, division, startDate ISO datetime, endDate ISO datetime | 201 jika create baru, data submission; 200 jika sudah ada dengan meta.alreadyExists true | 400 validation, 403, 404, 409/konflik bisnis |
| GET | /api/submissions/my-submissions | MAHASISWA | - | 200, data array submission milik tim user (status dipetakan ke workflow stage view) | 500 |
| GET | /api/submissions/:submissionId | MAHASISWA/ADMIN/KAPRODI/WAKIL_DEKAN/DOSEN | Path param submissionId | 200, data submission detail; untuk MAHASISWA ada ownership check tim | 403, 404 |
| PUT | /api/submissions/:submissionId | MAHASISWA | Path param submissionId; JSON optional: letterPurpose, companyName, companyAddress, companyPhone regex nomor, companyBusinessType 2-255 bila diisi, division, startDate, endDate | 200, data submission ter-update | 400 validation, 403, 404 |
| POST | /api/submissions/:submissionId/submit | MAHASISWA | Path param submissionId | 200, data submission status PENDING_REVIEW dan workflow PENDING_ADMIN_REVIEW | 400 bisnis, 403, 404 |
| POST | /api/submissions/:submissionId/documents | MAHASISWA | Path param submissionId; multipart/form-data: file wajib, documentType enum PROPOSAL_KETUA/SURAT_KESEDIAAN/FORM_PERMOHONAN/KRS_SEMESTER_4/DAFTAR_KUMPULAN_NILAI/BUKTI_PEMBAYARAN_UKT, memberUserId wajib, uploadedByUserId optional | 201, data dokumen baru (status default PENDING) | 400 validation/file, 403, 404, 409 upload ulang tidak diperbolehkan kecuali dokumen lama REJECTED |
| GET | /api/submissions/:submissionId/documents | MAHASISWA | Path param submissionId | 200, data array dokumen submission | 403, 404 |
| DELETE | /api/submissions/documents/:documentId | MAHASISWA | Path param documentId | 200, data null, message hasil delete | 403 jika status tidak boleh dihapus, 404 |
| PUT | /api/submissions/:submissionId/reset | MAHASISWA | Path param submissionId | 200, data submission reset ke DRAFT | 400 hanya rejected boleh reset, 403, 404 |
| GET | /api/submissions/:submissionId/letter-request-status | MAHASISWA | Path param submissionId | 200, alias status request surat per member (backward compatibility) | 403, 404 |

Catatan alias method aktif pada route submission:

- PATCH /api/submissions/:submissionId adalah alias PUT update.
- PUT /api/submissions/:submissionId/submit adalah alias POST submit.

---

## 6.5 Admin

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| GET | /api/admin/dashboard | ADMIN/KAPRODI/WAKIL_DEKAN | - | 200, data: totalMahasiswaKp, jumlahTimKp, mahasiswaAktifSemester4, totalPengajuanSuratPengantar, totalSuratBalasanDisetujuiTerverifikasi, totalDosenPembimbingKp, totalTemplateDokumen, statistikPengajuan, activities | 500 |
| GET | /api/admin/submissions/status/:status | ADMIN/KAPRODI/WAKIL_DEKAN | Path param status bucket DRAFT/PENDING_REVIEW/REJECTED/APPROVED | 200, data array submissions terfilter bucket | 400 status invalid, 500 |
| GET | /api/admin/submissions | ADMIN/KAPRODI/WAKIL_DEKAN | - | 200, data array seluruh submissions untuk admin | 500 |
| GET | /api/admin/submissions/:submissionId | ADMIN/KAPRODI/WAKIL_DEKAN | Path param submissionId | 200, data submission detail + letters + field normalized status | 404, 500 |
| PUT | /api/admin/submissions/:submissionId/status | ADMIN/KAPRODI/WAKIL_DEKAN | Path param submissionId; JSON: status enum APPROVED/REJECTED, rejectionReason optional namun wajib jika REJECTED, letterNumber optional namun wajib jika APPROVED, documentReviews wajib map docId ke approved/rejected | 200, data submission update hasil review admin | 400 validation/rule, 404 |
| POST | /api/admin/submissions/:submissionId/approve | ADMIN/KAPRODI/WAKIL_DEKAN | Path param submissionId; JSON optional: documentReviews map docId approved/rejected, autoGenerateLetter optional default false, letterNumber optional | 200, data hasil update status approve | 400, 404 |
| POST | /api/admin/submissions/:submissionId/reject | ADMIN/KAPRODI/WAKIL_DEKAN | Path param submissionId; JSON: reason wajib min 1, documentReviews optional map docId approved/rejected | 200, data hasil reject | 400, 404 |
| POST | /api/admin/submissions/:submissionId/generate-letter | ADMIN/KAPRODI/WAKIL_DEKAN | Path param submissionId; JSON optional: format enum pdf/docx default pdf | 201, data hasil generate surat | 400, 404, 500 |
| GET | /api/admin/statistics | ADMIN/KAPRODI/WAKIL_DEKAN | - | 200, data agregat: total, draft, pending, pendingDosenVerification, completed, approved, rejected | 500 |

---

## 6.6 Template

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| GET | /api/templates/active | Bearer | - | 200, data daftar template aktif | 500 |
| GET | /api/templates | Bearer | Query optional: type, isActive true/false, search | 200, data daftar template sesuai filter | 500 |
| GET | /api/templates/:id/download | Bearer | Path param id | 200 file binary dengan Content-Type dan Content-Disposition attachment | 400, 404 |
| GET | /api/templates/:id | Bearer | Path param id | 200, data template detail | 404 |
| POST | /api/templates | ADMIN/KAPRODI/WAKIL_DEKAN di route, namun controller membatasi ADMIN saja | multipart/form-data: file wajib, name wajib, type wajib, description optional, fields optional JSON array, isActive optional true/false | 201, data template baru | 400 validation, 403 non ADMIN, 500 |
| PUT | /api/templates/:id | ADMIN/KAPRODI/WAKIL_DEKAN di route, namun controller membatasi ADMIN saja | multipart/form-data optional: file, name, type, description, fields JSON array, isActive true/false | 200, data template update | 400, 403, 404 |
| DELETE | /api/templates/:id | ADMIN/KAPRODI/WAKIL_DEKAN di route, namun controller membatasi ADMIN saja | Path param id | 200, tanpa data khusus | 403, 404 |
| PATCH | /api/templates/:id/toggle-active | ADMIN/KAPRODI/WAKIL_DEKAN di route, namun controller membatasi ADMIN saja | Path param id | 200, data template dengan status aktif terbaru | 403, 404 |

---

## 6.7 Response Letters

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| POST | /api/response-letters | Bearer (umumnya MAHASISWA) | multipart/form-data: submissionId wajib, file wajib PDF max 10MB, letterStatus optional approved/rejected default approved | 201, data response letter baru | 400 validation, 403 bukan anggota tim, 404 submission not found, 409 sudah pernah submit |
| GET | /api/response-letters/admin | Bearer, controller ADMIN only | Query optional: letterStatus approved/rejected, verified true/false, sort, limit, offset | 200, data list response letters terformat | 403 non ADMIN |
| GET | /api/response-letters/my | Bearer | - | 200, data response letter tim user atau null jika belum ada | 401 jika user context invalid |
| GET | /api/response-letters/:id/status | Bearer | Path param id | 200, data: id, verified, letterStatus, teamWasReset, verifiedAt | 400 invalid id, 403, 404 |
| GET | /api/response-letters/:id | Bearer | Path param id | 200, data response letter detail + relasi | 400 invalid id, 403, 404 |
| PUT | /api/response-letters/admin/:id/verify | Bearer, controller ADMIN only | Path param id; JSON: letterStatus approved/rejected | 200, data response letter terverifikasi + resetTeam false + resetReason | 400 validation, 403, 404 |
| DELETE | /api/response-letters/admin/:id | Bearer, controller ADMIN only | Path param id | 200, data null | 400 invalid id, 403, 404 |

---

## 6.8 Dosen Dashboard dan Profil

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| GET | /api/dosen/dashboard | DOSEN | - | 200, data: totalMahasiswaBimbingan, totalSuratAjuanMasuk, activities | 403, 500 |
| GET | /api/dosen/dashboard/wakdek | DOSEN atau WAKIL_DEKAN (dengan validasi jabatan wakil dekan akademik di service) | - | 200, data: totalAjuanSuratPengantarMasuk, activities | 403 |
| GET | /api/dosen/me | DOSEN | - | 200, data: id, nama, email, phone, nip, jabatan, fakultas, prodi, esignature object atau null | 404, 500 |
| PUT | /api/dosen/me/profile | DOSEN | JSON optional: nama max 255, email, phone max 20, jabatan nullable max 100, fakultas nullable max 100, prodi nullable max 100; minimal 1 field | 200, data profil terbaru | 400, 500 |
| PUT | /api/dosen/me/esignature | DOSEN | multipart/form-data: signatureFile File png/jpg/jpeg, max 2 MB | 200, data: url, key, uploadedAt | 400, 500 |
| DELETE | /api/dosen/me/esignature | DOSEN | - | 200, data null | 500 |

---

## 6.9 Dosen - Surat Kesediaan

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| GET | /api/dosen/surat-kesediaan/requests | DOSEN atau WAKIL_DEKAN | - | 200, data list request: id, tanggal, nim, namaMahasiswa, programStudi, status, dosen info, approvedAt, signedFileUrl, rejectionReason | 500 |
| PUT | /api/dosen/surat-kesediaan/requests/:requestId/approve | DOSEN | Path param requestId | 200, data: requestId, status DISETUJUI, approvedAt, signedFileUrl | 400/409 processed, 403, 404, 422 e-signature dosen invalid |
| PUT | /api/dosen/surat-kesediaan/requests/:requestId/reject | DOSEN | Path param requestId; JSON: rejection_reason wajib min 1 max 1000 | 200, data reject info | 400 validation, 403, 404, 409 |
| PUT | /api/dosen/surat-kesediaan/requests/approve-bulk | DOSEN | JSON: requestIds array string minimal 1 item | 200, data: approvedCount, failed array | 400 validation, 403 |

## 6.10 Mahasiswa - Surat Kesediaan

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| POST | /api/mahasiswa/surat-kesediaan/requests | MAHASISWA | JSON: memberUserId wajib, dosenUserId optional | 200, data: requestId | 400 validation, 403, 404, 409, 422 |
| PUT | /api/mahasiswa/surat-kesediaan/requests/:requestId/reapply | MAHASISWA | Path param requestId; JSON: memberUserId wajib | 200, data reapply request | 400 validation, 403, 404, 409 |

---

## 6.11 Dosen - Surat Permohonan

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| GET | /api/dosen/surat-permohonan/requests | DOSEN atau WAKIL_DEKAN | - | 200, data list request surat permohonan detail | 500 |
| PUT | /api/dosen/surat-permohonan/requests/:requestId/approve | DOSEN | Path param requestId | 200, data: requestId, status DISETUJUI, approvedAt, signedFileUrl | 403, 404, 409, 422 |
| PUT | /api/dosen/surat-permohonan/requests/approve-bulk | DOSEN | JSON: requestIds array string min 1 | 200, data: approvedCount, failed | 400 validation, 403 |
| PUT | /api/dosen/surat-permohonan/requests/:requestId/reject | DOSEN | Path param requestId; JSON: rejection_reason wajib min 1 max 1000 | 200, data reject info | 400 validation, 403, 404, 409 |

## 6.12 Mahasiswa - Surat Permohonan

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| POST | /api/mahasiswa/surat-permohonan/requests | MAHASISWA | JSON: memberUserId wajib | 200, data: requestId | 400 validation, 403, 404, 409, 422 |
| PUT | /api/mahasiswa/surat-permohonan/requests/:requestId/reapply | MAHASISWA | Path param requestId; JSON: memberUserId wajib | 200, data reapply request | 400 validation, 403, 404, 409 |

Catatan alias aktif pada route mahasiswa surat permohonan:

- PATCH dan POST pada path reapply adalah alias dari PUT.
- POST /api/mahasiswa/surat-permohonan/request adalah alias request.

---

## 6.13 Dosen - Surat Pengantar

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| GET | /api/dosen/surat-pengantar/requests | DOSEN atau WAKIL_DEKAN | - | 200, data queue/histori verifikasi surat pengantar | 500 |
| PUT | /api/dosen/surat-pengantar/requests/:requestId/approve | DOSEN atau WAKIL_DEKAN | Path param requestId | 200, data: requestId, submissionId, status approved, approvedAt, signedFileUrl | 403, 404, 409, 422 |
| PUT | /api/dosen/surat-pengantar/requests/:requestId/reject | DOSEN atau WAKIL_DEKAN | Path param requestId; JSON: rejection_reason wajib min 1 | 200, data reject summary | 400 validation, 403, 404, 409 |

---

## 6.14 Utils

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| GET | /api/utils/document-types | Public | - | 200, data array: PROPOSAL_KETUA, SURAT_KESEDIAAN, FORM_PERMOHONAN, KRS_SEMESTER_4, DAFTAR_KUMPULAN_NILAI, BUKTI_PEMBAYARAN_UKT | - |
| GET | /api/utils/document-types/all | Public | - | 200, data array termasuk SURAT_PENGANTAR | - |

---

## 6.15 Assets

| Method | Path | Auth | Request | Success Response | Error Utama |
|---|---|---|---|---|---|
| OPTIONS | /api/assets/r2/* | Public | CORS preflight | 204 no body | - |
| GET | /api/assets/r2/* | Public | Wildcard path key object R2, hanya path prefix esignatures/ yang diizinkan | 200 file binary + content-type + cache headers | 403 forbidden path, 404 not found |

## 7. Ringkasan Alur End to End

### 7.1 Alur Mahasiswa sampai Surat Pengantar

1. Mahasiswa login.
2. Mahasiswa buat tim.
3. Ketua invite anggota.
4. Anggota menerima undangan.
5. Ketua finalize tim.
6. Ketua/member membuat submission draft.
7. Tim melengkapi data perusahaan dan upload dokumen.
8. Ketua submit for review.
9. Admin review dokumen dan set status approve/reject.
10. Jika admin approve, submission masuk queue dosen.
11. Dosen approve atau reject surat pengantar.
12. Jika approve, status submission menjadi COMPLETED.

### 7.2 Alur Surat Balasan Perusahaan

1. Setelah submission selesai, mahasiswa upload response letter PDF.
2. Admin memverifikasi response letter.
3. Jika verified approved: submission responseLetterStatus jadi verified.
4. Jika verified rejected: sistem tidak auto reset, mahasiswa perlu aksi manual mulai ulang.

### 7.3 Alur Surat Kesediaan dan Surat Permohonan

1. Mahasiswa mengajukan request per anggota tim.
2. Dosen melihat daftar request.
3. Dosen approve/reject single atau bulk.
4. Untuk approve, sistem generate signed PDF dan simpan URL.
5. Jika ditolak, mahasiswa dapat reapply request yang sama.

## 8. Catatan Implementasi Penting

- Ada dual status di submission: status dan workflowStage. Untuk alur baru, workflowStage adalah indikator utama.
- Template endpoint secara route memperbolehkan adminOnly, tetapi controller saat ini hanya role ADMIN yang lolos.
- Response letter endpoint admin juga memakai guard controller role ADMIN.
- Team reset dan archive submission memakai konsep archivedAt pada submissions.
- Beberapa endpoint menyediakan alias method/path untuk kompatibilitas klien.

## 9. Endpoint Kompatibilitas yang Tidak Masuk Katalog Utama

Endpoint berikut tetap ada di kode, tetapi dianggap fallback/alias kompatibilitas:

- Prefix /api/surat-kesediaan (fallback global).
- Prefix /api/surat-permohonan (fallback global).
- Alias method/path tertentu pada mahasiswa surat permohonan reapply dan request.
- Alias endpoint letter-request-status di /api/submissions.

Dokumen ini sengaja memprioritaskan endpoint utama/canonical untuk dokumentasi operasional backend.

## 10. Contoh Payload JSON Endpoint Kritikal

Catatan:

- Header auth untuk endpoint protected:
  - Authorization: Bearer <jwt_token>
- Mayoritas response mengikuti format:
  - success: boolean
  - message: string
  - data: object atau array atau null
- Untuk endpoint multipart/form-data, contoh JSON di bawah merepresentasikan field non-file.

### 10.1 POST /api/auth/register/mahasiswa

Request JSON:

```json
{
  "nim": "09031382227001",
  "nama": "Andi Pratama",
  "email": "andi.mahasiswa@unsri.ac.id",
  "password": "rahasia123",
  "fakultas": "Fakultas Ilmu Komputer",
  "prodi": "Manajemen Informatika",
  "semester": 6,
  "jumlahSksSelesai": 104,
  "angkatan": "2022",
  "phone": "081234567890"
}
```

Response sukses (201):

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "1712498623199-ab12cd345",
      "nama": "Andi Pratama",
      "email": "andi.mahasiswa@unsri.ac.id",
      "role": "MAHASISWA",
      "nim": "09031382227001",
      "fakultas": "Fakultas Ilmu Komputer",
      "prodi": "Manajemen Informatika",
      "jumlahSksSelesai": 104
    },
    "token": "<jwt_token>"
  }
}
```

Response error duplikat (409):

```json
{
  "success": false,
  "message": "NIM already registered"
}
```

### 10.2 POST /api/auth/login

Request JSON:

```json
{
  "email": "andi.mahasiswa@unsri.ac.id",
  "password": "rahasia123"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "1712498623199-ab12cd345",
      "nama": "Andi Pratama",
      "email": "andi.mahasiswa@unsri.ac.id",
      "role": "MAHASISWA",
      "nim": "09031382227001",
      "fakultas": "Fakultas Ilmu Komputer",
      "prodi": "Manajemen Informatika",
      "semester": 6,
      "jumlahSksSelesai": 104,
      "angkatan": "2022"
    },
    "token": "<jwt_token>"
  }
}
```

### 10.3 POST /api/teams/:teamId/invite

Request JSON:

```json
{
  "memberNim": "09031382227002"
}
```

Response sukses (201):

```json
{
  "success": true,
  "message": "Invitation sent successfully",
  "data": {
    "id": "1712498695000-invite001",
    "teamId": "team-001",
    "userId": "user-anggota-001",
    "role": "ANGGOTA",
    "invitationStatus": "PENDING",
    "invitedBy": "user-ketua-001",
    "invitedAt": "2026-04-06T09:01:35.000Z",
    "respondedAt": null
  }
}
```

### 10.4 POST /api/teams/invitations/:memberId/respond

Request JSON:

```json
{
  "accept": true
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Invitation response recorded",
  "data": {
    "success": true,
    "status": "ACCEPTED",
    "member": {
      "id": "1712498695000-invite001",
      "teamId": "team-001",
      "userId": "user-anggota-001",
      "invitationStatus": "ACCEPTED",
      "respondedAt": "2026-04-06T09:05:12.000Z"
    }
  }
}
```

### 10.5 POST /api/teams/:teamId/finalize

Request body:

```json
{}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Tim berhasil difinalisasi",
  "data": {
    "id": "team-001",
    "code": "TEAM-AB12CD",
    "status": "FIXED",
    "message": "Tim berhasil difinalisasi dan siap untuk pengajuan",
    "submission": {
      "id": "sub-001",
      "teamId": "team-001",
      "status": "DRAFT",
      "workflowStage": "DRAFT",
      "adminVerificationStatus": "PENDING",
      "dosenVerificationStatus": "PENDING",
      "letterPurpose": "Belum diisi",
      "companyName": "Belum diisi",
      "companyAddress": "Belum diisi",
      "companyPhone": null,
      "companyBusinessType": null,
      "division": "Belum diisi",
      "startDate": "2026-04-06",
      "endDate": "2026-04-06"
    },
    "submissionAlreadyExists": false
  }
}
```

### 10.6 POST /api/submissions

Request JSON:

```json
{
  "teamId": "team-001",
  "letterPurpose": "Permohonan surat pengantar kerja praktik",
  "companyName": "PT Maju Bersama",
  "companyAddress": "Jl. Jenderal Sudirman No. 12, Palembang",
  "companyPhone": "+62 711 123456",
  "companyBusinessType": "Teknologi Informasi",
  "division": "Software Development",
  "startDate": "2026-05-01T00:00:00.000Z",
  "endDate": "2026-07-31T00:00:00.000Z"
}
```

Response sukses create baru (201):

```json
{
  "success": true,
  "message": "Submission created",
  "data": {
    "id": "sub-001",
    "teamId": "team-001",
    "letterPurpose": "Permohonan surat pengantar kerja praktik",
    "companyName": "PT Maju Bersama",
    "companyAddress": "Jl. Jenderal Sudirman No. 12, Palembang",
    "companyPhone": "+62 711 123456",
    "companyBusinessType": "Teknologi Informasi",
    "division": "Software Development",
    "startDate": "2026-05-01",
    "endDate": "2026-07-31",
    "status": "DRAFT",
    "workflowStage": "DRAFT",
    "adminVerificationStatus": "PENDING",
    "dosenVerificationStatus": "PENDING",
    "submittedAt": null,
    "approvedAt": null,
    "rejectionReason": null,
    "responseLetterStatus": "pending"
  }
}
```

Response idempotent (200, sudah ada):

```json
{
  "success": true,
  "message": "Submission already exists",
  "data": {
    "id": "sub-001",
    "teamId": "team-001",
    "status": "DRAFT",
    "workflowStage": "DRAFT"
  },
  "meta": {
    "alreadyExists": true
  }
}
```

### 10.7 PUT /api/submissions/:submissionId

Request JSON:

```json
{
  "letterPurpose": "Permohonan surat pengantar KP semester genap",
  "companyName": "PT Maju Bersama",
  "companyAddress": "Jl. Jenderal Sudirman No. 12, Palembang",
  "companyPhone": "(0711) 123456",
  "companyBusinessType": "Pengembangan perangkat lunak",
  "division": "Engineering",
  "startDate": "2026-05-01",
  "endDate": "2026-07-31"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Submission updated successfully",
  "data": {
    "id": "sub-001",
    "teamId": "team-001",
    "letterPurpose": "Permohonan surat pengantar KP semester genap",
    "companyName": "PT Maju Bersama",
    "companyAddress": "Jl. Jenderal Sudirman No. 12, Palembang",
    "companyPhone": "(0711) 123456",
    "companyBusinessType": "Pengembangan perangkat lunak",
    "division": "Engineering",
    "startDate": "2026-05-01",
    "endDate": "2026-07-31",
    "status": "DRAFT",
    "workflowStage": "DRAFT"
  }
}
```

### 10.8 POST /api/submissions/:submissionId/submit

Request body:

```json
{}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Submission submitted for review",
  "data": {
    "id": "sub-001",
    "teamId": "team-001",
    "status": "PENDING_REVIEW",
    "workflowStage": "PENDING_ADMIN_REVIEW",
    "adminVerificationStatus": "PENDING",
    "dosenVerificationStatus": "PENDING",
    "submittedAt": "2026-04-06T09:30:00.000Z",
    "approvedAt": null,
    "rejectionReason": null,
    "finalSignedFileUrl": null
  }
}
```

### 10.9 POST /api/submissions/:submissionId/documents (multipart)

Field non-file (representasi JSON):

```json
{
  "documentType": "PROPOSAL_KETUA",
  "memberUserId": "user-ketua-001",
  "uploadedByUserId": "user-ketua-001"
}
```

Form-data wajib tambahan:

- file: binary (pdf/doc/docx, maksimal 10MB)

Response sukses (201):

```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "id": "doc-001",
    "submissionId": "sub-001",
    "documentType": "PROPOSAL_KETUA",
    "memberUserId": "user-ketua-001",
    "uploadedByUserId": "user-ketua-001",
    "originalName": "proposal_kp.pdf",
    "fileName": "submissions/2026/04/1712499012-proposal_kp.pdf",
    "fileType": "application/pdf",
    "fileSize": 534112,
    "fileUrl": "https://assets.example.com/submissions/2026/04/1712499012-proposal_kp.pdf",
    "status": "PENDING",
    "statusUpdatedAt": "2026-04-06T09:36:52.000Z",
    "createdAt": "2026-04-06T09:36:52.000Z"
  }
}
```

### 10.10 PUT /api/admin/submissions/:submissionId/status (approve)

Request JSON:

```json
{
  "status": "APPROVED",
  "letterNumber": "001/MI-FASILKOM-UNSRI/IV/2026",
  "documentReviews": {
    "doc-001": "approved",
    "doc-002": "approved",
    "doc-003": "approved",
    "doc-004": "approved",
    "doc-005": "approved",
    "doc-006": "approved"
  }
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Status submission berhasil diupdate",
  "data": {
    "id": "sub-001",
    "status": "PENDING_REVIEW",
    "workflowStage": "PENDING_DOSEN_VERIFICATION",
    "adminVerificationStatus": "APPROVED",
    "adminVerifiedAt": "2026-04-06T10:00:00.000Z",
    "adminVerifiedBy": "admin-001",
    "dosenVerificationStatus": "PENDING",
    "letterNumber": "001/MI-FASILKOM-UNSRI/IV/2026",
    "documentReviews": {
      "doc-001": "approved",
      "doc-002": "approved",
      "doc-003": "approved",
      "doc-004": "approved",
      "doc-005": "approved",
      "doc-006": "approved"
    },
    "documents": [
      {
        "id": "doc-001",
        "status": "APPROVED"
      },
      {
        "id": "doc-002",
        "status": "APPROVED"
      }
    ]
  }
}
```

### 10.11 PUT /api/admin/submissions/:submissionId/status (reject)

Request JSON:

```json
{
  "status": "REJECTED",
  "rejectionReason": "Dokumen FORM_PERMOHONAN belum ditandatangani lengkap",
  "documentReviews": {
    "doc-001": "approved",
    "doc-002": "approved",
    "doc-003": "rejected",
    "doc-004": "approved",
    "doc-005": "approved",
    "doc-006": "approved"
  }
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Status submission berhasil diupdate",
  "data": {
    "id": "sub-001",
    "status": "PENDING_REVIEW",
    "workflowStage": "REJECTED_ADMIN",
    "adminVerificationStatus": "REJECTED",
    "adminVerifiedAt": "2026-04-06T10:05:00.000Z",
    "adminVerifiedBy": "admin-001",
    "adminRejectionReason": "Dokumen FORM_PERMOHONAN belum ditandatangani lengkap",
    "rejectionReason": "Dokumen FORM_PERMOHONAN belum ditandatangani lengkap",
    "documentReviews": {
      "doc-001": "approved",
      "doc-002": "approved",
      "doc-003": "rejected",
      "doc-004": "approved",
      "doc-005": "approved",
      "doc-006": "approved"
    }
  }
}
```

### 10.12 POST /api/admin/submissions/:submissionId/generate-letter

Request JSON:

```json
{
  "format": "pdf"
}
```

Response sukses (201):

```json
{
  "success": true,
  "message": "Letter generated successfully",
  "data": {
    "id": "letter-001",
    "submissionId": "sub-001",
    "letterNumber": "001/MI-FASILKOM-UNSRI/IV/2026",
    "fileName": "letters/sub-001-001.pdf",
    "fileType": "PDF",
    "fileUrl": "https://assets.example.com/letters/sub-001-001.pdf",
    "generatedBy": "admin-001",
    "generatedAt": "2026-04-06T10:15:00.000Z"
  }
}
```

### 10.13 POST /api/response-letters (multipart)

Field non-file (representasi JSON):

```json
{
  "submissionId": "sub-001",
  "letterStatus": "approved"
}
```

Form-data wajib tambahan:

- file: binary PDF maksimal 10MB

Response sukses (201):

```json
{
  "success": true,
  "message": "Response letter submitted successfully",
  "data": {
    "id": "resp-001",
    "submissionId": "sub-001",
    "letterStatus": "approved",
    "originalName": "surat_balasan_perusahaan.pdf",
    "fileName": "response-letter-sub-001-a1b2c3d4-1712499300.pdf",
    "fileType": "application/pdf",
    "fileSize": 742210,
    "fileUrl": "https://assets.example.com/response-letters/2026-04/response-letter-sub-001-a1b2c3d4-1712499300.pdf",
    "memberUserId": "user-ketua-001",
    "verified": false,
    "verifiedAt": null,
    "verifiedByAdminId": null,
    "submittedAt": "2026-04-06T10:30:00.000Z"
  }
}
```

### 10.14 PUT /api/response-letters/admin/:id/verify

Request JSON:

```json
{
  "letterStatus": "rejected"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Response letter verified successfully",
  "data": {
    "id": "resp-001",
    "submissionId": "sub-001",
    "letterStatus": "rejected",
    "verified": true,
    "verifiedAt": "2026-04-06T10:45:00.000Z",
    "verifiedByAdminId": "admin-001",
    "resetTeam": false,
    "resetReason": null
  }
}
```

### 10.15 POST /api/mahasiswa/surat-kesediaan/requests

Request JSON:

```json
{
  "memberUserId": "user-anggota-001",
  "dosenUserId": "dosen-001"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Pengajuan surat kesediaan berhasil dikirim ke dosen",
  "data": {
    "requestId": "skd-001"
  }
}
```

### 10.16 PUT /api/dosen/surat-kesediaan/requests/:requestId/reject

Request JSON:

```json
{
  "rejection_reason": "Tanda tangan mahasiswa pada lampiran belum valid"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Pengajuan surat kesediaan berhasil ditolak",
  "data": {
    "requestId": "skd-001",
    "status": "DITOLAK",
    "rejectionReason": "Tanda tangan mahasiswa pada lampiran belum valid",
    "rejectedAt": "2026-04-06T11:00:00.000Z"
  }
}
```

### 10.17 POST /api/mahasiswa/surat-permohonan/requests

Request JSON:

```json
{
  "memberUserId": "user-anggota-001"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Pengajuan surat permohonan berhasil dikirim ke dosen",
  "data": {
    "requestId": "spm-001"
  }
}
```

### 10.18 PUT /api/dosen/surat-pengantar/requests/:requestId/reject

Request JSON:

```json
{
  "rejection_reason": "Tanggal pelaksanaan KP pada submission belum sesuai kalender akademik"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Pengajuan surat pengantar berhasil ditolak",
  "data": {
    "requestId": "sub-001",
    "submissionId": "sub-001",
    "status": "DITOLAK",
    "rejectionReason": "Tanggal pelaksanaan KP pada submission belum sesuai kalender akademik",
    "rejectedAt": "2026-04-06T11:10:00.000Z"
  }
}
```

### 10.19 Contoh Error Validation Umum

Response contoh (400):

```json
{
  "success": false,
  "message": "Validation failed",
  "data": {
    "errors": [
      {
        "code": "invalid_type",
        "path": [
          "memberUserId"
        ],
        "message": "Required"
      }
    ]
  }
}
```

## 11. Contoh Payload Endpoint Aktif Lainnya (Non-Kritikal)

Section ini melengkapi endpoint aktif yang belum dicontohkan di Section 10.

### 11.1 POST /api/auth/register/admin

Request JSON:

```json
{
  "nip": "198901012019031001",
  "nama": "Siti Admin",
  "email": "siti.admin@unsri.ac.id",
  "password": "admin123",
  "role": "ADMIN",
  "fakultas": "Fakultas Ilmu Komputer",
  "prodi": "Manajemen Informatika",
  "phone": "081299998888"
}
```

Response sukses (201):

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "admin-001",
      "nama": "Siti Admin",
      "email": "siti.admin@unsri.ac.id",
      "role": "ADMIN",
      "nip": "198901012019031001",
      "fakultas": "Fakultas Ilmu Komputer",
      "prodi": "Manajemen Informatika"
    },
    "token": "<jwt_token_admin>"
  }
}
```

### 11.2 POST /api/auth/register/dosen

Request JSON:

```json
{
  "nip": "197812102005011002",
  "nama": "Dr. Budi Santoso",
  "email": "budi.dosen@unsri.ac.id",
  "password": "dosen123",
  "jabatan": "Dosen Tetap",
  "fakultas": "Fakultas Ilmu Komputer",
  "prodi": "Manajemen Informatika",
  "phone": "081377771111"
}
```

Response sukses (201):

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "dosen-001",
      "nama": "Dr. Budi Santoso",
      "email": "budi.dosen@unsri.ac.id",
      "role": "DOSEN",
      "nip": "197812102005011002",
      "jabatan": "Dosen Tetap",
      "fakultas": "Fakultas Ilmu Komputer",
      "prodi": "Manajemen Informatika"
    },
    "token": "<jwt_token_dosen>"
  }
}
```

### 11.3 GET /api/auth/me

Response sukses (200):

```json
{
  "success": true,
  "message": "User retrieved",
  "data": {
    "userId": "1712498623199-ab12cd345",
    "email": "andi.mahasiswa@unsri.ac.id",
    "role": "MAHASISWA",
    "nim": "09031382227001"
  }
}
```

### 11.4 GET /api/mahasiswa/dashboard

Response sukses (200):

```json
{
  "success": true,
  "message": "Mahasiswa dashboard retrieved",
  "data": {
    "kerjaPraktik": {
      "code": "on_going",
      "label": "Sedang Berlangsung",
      "description": "Periode: 2026-05-01 - 2026-07-31"
    },
    "hariTersisa": 62,
    "tahapBerikutnya": {
      "title": "Menunggu pemverifikasian surat balasan",
      "description": "Surat balasan sudah dikirim dan sedang menunggu verifikasi.",
      "actionLabel": "Lihat Surat Balasan",
      "actionUrl": "/mahasiswa/kp/surat-balasan"
    },
    "statusPengajuan": {
      "code": "approved",
      "submitted": true,
      "label": "Pengajuan Surat Pengantar disetujui."
    },
    "teamInfo": {
      "teamId": "team-001",
      "teamName": "TEAM-AB12CD",
      "members": [
        {
          "name": "Andi Pratama",
          "nim": "09031382227001",
          "role": "Ketua"
        },
        {
          "name": "Dewi Lestari",
          "nim": "09031382227002",
          "role": "Anggota"
        }
      ],
      "mentorName": null,
      "mentorEmail": null,
      "dosenName": "Dr. Budi Santoso",
      "dosenNip": "197812102005011002"
    },
    "activities": []
  }
}
```

### 11.5 GET /api/mahasiswa/me

Response sukses (200):

```json
{
  "success": true,
  "message": "Mahasiswa profile retrieved",
  "data": {
    "id": "user-ketua-001",
    "nama": "Andi Pratama",
    "email": "andi.mahasiswa@unsri.ac.id",
    "phone": "081234567890",
    "nim": "09031382227001",
    "fakultas": "Fakultas Ilmu Komputer",
    "prodi": "Manajemen Informatika",
    "semester": 6,
    "jumlahSksSelesai": 104,
    "angkatan": "2022",
    "esignature": {
      "url": "https://assets.example.com/esignatures/user-ketua-001/signature.png",
      "key": "esignatures/user-ketua-001/signature.png",
      "uploadedAt": "2026-04-01T08:00:00.000Z"
    }
  }
}
```

### 11.6 GET /api/mahasiswa/search?q=andi

Response sukses (200):

```json
{
  "success": true,
  "message": "Mahasiswa search results",
  "data": [
    {
      "id": "user-ketua-001",
      "nim": "09031382227001",
      "nama": "Andi Pratama",
      "email": "andi.mahasiswa@unsri.ac.id",
      "prodi": "Manajemen Informatika"
    }
  ]
}
```

### 11.7 GET /api/teams/my-teams

Response sukses (200):

```json
{
  "success": true,
  "message": "Teams retrieved",
  "data": [
    {
      "id": "team-001",
      "code": "TEAM-AB12CD",
      "dosen_kp_id": "dosen-001",
      "dosen_kp_name": "Dr. Budi Santoso",
      "leaderId": "user-ketua-001",
      "isLeader": true,
      "status": "FIXED",
      "members": [
        {
          "id": "tm-001",
          "teamId": "team-001",
          "userId": "user-ketua-001",
          "role": "KETUA",
          "status": "ACCEPTED",
          "user": {
            "id": "user-ketua-001",
            "nim": "09031382227001",
            "name": "Andi Pratama",
            "email": "andi.mahasiswa@unsri.ac.id"
          }
        }
      ]
    }
  ]
}
```

### 11.8 GET /api/teams/my-invitations

Response sukses (200):

```json
{
  "success": true,
  "message": "Invitations retrieved",
  "data": [
    {
      "id": "tm-inv-009",
      "teamId": "team-009",
      "userId": "user-anggota-001",
      "status": "PENDING",
      "invitedBy": "user-ketua-009",
      "invitedAt": "2026-04-06T08:01:00.000Z",
      "respondedAt": null,
      "team": {
        "id": "team-009",
        "code": "TEAM-ZX90QP",
        "name": "TEAM-ZX90QP",
        "leaderName": "Rina Kurnia",
        "leaderNim": "09031382227111"
      },
      "inviter": {
        "id": "user-ketua-009",
        "nim": "09031382227111",
        "name": "Rina Kurnia",
        "email": "rina.mahasiswa@unsri.ac.id"
      }
    }
  ]
}
```

### 11.9 POST /api/teams/invitations/:memberId/cancel

Request body:

```json
{}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Invitation cancelled successfully",
  "data": {
    "success": true,
    "message": "Invitation cancelled successfully",
    "cancelledInvitationId": "tm-inv-009",
    "cancelledUserId": "user-anggota-001",
    "teamId": "team-009"
  }
}
```

### 11.10 GET /api/teams/:teamId/members

Response sukses (200):

```json
{
  "success": true,
  "message": "Team members retrieved",
  "data": [
    {
      "id": "tm-001",
      "teamId": "team-001",
      "userId": "user-ketua-001",
      "role": "KETUA",
      "status": "ACCEPTED",
      "invitedBy": "user-ketua-001",
      "invitedAt": "2026-04-05T12:00:00.000Z",
      "respondedAt": "2026-04-05T12:00:00.000Z",
      "user": {
        "id": "user-ketua-001",
        "nim": "09031382227001",
        "name": "Andi Pratama",
        "email": "andi.mahasiswa@unsri.ac.id"
      }
    }
  ]
}
```

### 11.11 POST /api/teams/:teamId/leave

Response sukses (200):

```json
{
  "success": true,
  "message": "Successfully left the team",
  "data": {
    "success": true,
    "message": "Successfully left the team",
    "teamId": "team-001"
  }
}
```

### 11.12 POST /api/teams/:teamId/members/:memberId/remove

Response sukses (200):

```json
{
  "success": true,
  "message": "Member removed successfully",
  "data": {
    "success": true,
    "message": "Member removed successfully",
    "removedMemberId": "user-anggota-001",
    "teamId": "team-001"
  }
}
```

### 11.13 POST /api/teams/:teamId/delete

Response sukses (200):

```json
{
  "success": true,
  "message": "Team deleted successfully",
  "data": {
    "deletedTeamId": "team-001",
    "deletedTeamCode": "TEAM-AB12CD",
    "membersAffected": 3
  }
}
```

### 11.14 POST /api/teams/reset

Response sukses (200):

```json
{
  "success": true,
  "message": "Tim berhasil direset. Anda dapat membuat submission baru.",
  "data": {
    "teamId": "team-001",
    "teamCode": "TEAM-AB12CD",
    "teamStatus": "PENDING",
    "archivedSubmissionIds": [
      "sub-001"
    ],
    "resetAt": "2026-04-06T12:00:00.000Z"
  }
}
```

### 11.15 GET /api/submissions/my-submissions

Response sukses (200):

```json
{
  "success": true,
  "message": "Submissions retrieved",
  "data": [
    {
      "id": "sub-001",
      "teamId": "team-001",
      "status": "PENDING_DOSEN_VERIFICATION",
      "legacyStatus": "PENDING_REVIEW",
      "submissionStatus": "PENDING_DOSEN_VERIFICATION",
      "adminStatus": "APPROVED",
      "isAdminApproved": true,
      "companyName": "PT Maju Bersama",
      "companyAddress": "Jl. Jenderal Sudirman No. 12, Palembang",
      "division": "Engineering",
      "startDate": "2026-05-01",
      "endDate": "2026-07-31",
      "finalSignedFileUrl": null
    }
  ]
}
```

### 11.16 GET /api/submissions/:submissionId

Response sukses (200):

```json
{
  "success": true,
  "message": "Submission retrieved",
  "data": {
    "id": "sub-001",
    "teamId": "team-001",
    "status": "PENDING_DOSEN_VERIFICATION",
    "legacyStatus": "PENDING_REVIEW",
    "submissionStatus": "PENDING_DOSEN_VERIFICATION",
    "adminStatus": "APPROVED",
    "isAdminApproved": true,
    "letterPurpose": "Permohonan surat pengantar KP semester genap",
    "companyName": "PT Maju Bersama",
    "companyAddress": "Jl. Jenderal Sudirman No. 12, Palembang",
    "companyPhone": "(0711) 123456",
    "companyBusinessType": "Pengembangan perangkat lunak",
    "division": "Engineering",
    "startDate": "2026-05-01",
    "endDate": "2026-07-31"
  }
}
```

### 11.17 GET /api/submissions/:submissionId/documents

Response sukses (200):

```json
{
  "success": true,
  "message": "Documents retrieved",
  "data": [
    {
      "id": "doc-001",
      "submissionId": "sub-001",
      "documentType": "PROPOSAL_KETUA",
      "memberUserId": "user-ketua-001",
      "uploadedByUserId": "user-ketua-001",
      "originalName": "proposal_kp.pdf",
      "fileUrl": "https://assets.example.com/submissions/2026/04/1712499012-proposal_kp.pdf",
      "status": "APPROVED"
    }
  ]
}
```

### 11.18 DELETE /api/submissions/documents/:documentId

Response sukses (200):

```json
{
  "success": true,
  "message": "Document deleted successfully",
  "data": null
}
```

### 11.19 PUT /api/submissions/:submissionId/reset

Response sukses (200):

```json
{
  "success": true,
  "message": "Submission reset to draft",
  "data": {
    "id": "sub-001",
    "status": "DRAFT",
    "workflowStage": "DRAFT",
    "adminVerificationStatus": "PENDING",
    "dosenVerificationStatus": "PENDING",
    "rejectionReason": null,
    "letterNumber": null,
    "finalSignedFileUrl": null,
    "documentReviews": {},
    "statusHistory": [
      {
        "status": "DRAFT",
        "date": "2026-04-06T12:10:00.000Z"
      }
    ]
  }
}
```

### 11.20 GET /api/admin/dashboard

Response sukses (200):

```json
{
  "success": true,
  "message": "Admin dashboard retrieved",
  "data": {
    "totalMahasiswaKp": 120,
    "jumlahTimKp": 48,
    "mahasiswaAktifSemester4": 210,
    "totalPengajuanSuratPengantar": 57,
    "totalSuratBalasanDisetujuiTerverifikasi": 31,
    "totalDosenPembimbingKp": 18,
    "totalTemplateDokumen": 6,
    "statistikPengajuan": [
      {
        "month": "Jan",
        "submissions": 10,
        "approved": 7,
        "approvalRate": 70
      }
    ],
    "activities": []
  }
}
```

### 11.21 GET /api/admin/submissions/status/:status

Response sukses (200):

```json
{
  "success": true,
  "message": "Submissions retrieved",
  "data": [
    {
      "id": "sub-001",
      "teamId": "team-001",
      "status": "PENDING_REVIEW",
      "workflowStage": "PENDING_ADMIN_REVIEW",
      "companyName": "PT Maju Bersama"
    }
  ]
}
```

### 11.22 GET /api/admin/submissions

Response sukses (200):

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": "sub-001",
      "teamId": "team-001",
      "status": "PENDING_REVIEW",
      "workflowStage": "PENDING_ADMIN_REVIEW",
      "documents": [
        {
          "id": "doc-001",
          "documentType": "PROPOSAL_KETUA",
          "status": "PENDING"
        }
      ]
    }
  ]
}
```

### 11.23 GET /api/admin/submissions/:submissionId

Response sukses (200):

```json
{
  "success": true,
  "message": "Submission retrieved",
  "data": {
    "id": "sub-001",
    "teamId": "team-001",
    "status": "PENDING_REVIEW",
    "workflowStage": "PENDING_ADMIN_REVIEW",
    "submissionStatus": "PENDING_ADMIN_REVIEW",
    "adminStatus": "PENDING",
    "admin_status": "PENDING",
    "isAdminApproved": false,
    "documents": [
      {
        "id": "doc-001",
        "documentType": "PROPOSAL_KETUA",
        "status": "PENDING"
      }
    ],
    "letters": []
  }
}
```

### 11.24 POST /api/admin/submissions/:submissionId/approve

Request JSON:

```json
{
  "documentReviews": {
    "doc-001": "approved",
    "doc-002": "approved"
  },
  "autoGenerateLetter": false,
  "letterNumber": "002/MI-FASILKOM-UNSRI/IV/2026"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Submission approved successfully",
  "data": {
    "id": "sub-001",
    "workflowStage": "PENDING_DOSEN_VERIFICATION",
    "adminVerificationStatus": "APPROVED",
    "letterNumber": "002/MI-FASILKOM-UNSRI/IV/2026"
  }
}
```

### 11.25 POST /api/admin/submissions/:submissionId/reject

Request JSON:

```json
{
  "reason": "Dokumen KRS semester 4 belum sesuai format",
  "documentReviews": {
    "doc-001": "approved",
    "doc-002": "rejected"
  }
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Submission rejected",
  "data": {
    "id": "sub-001",
    "workflowStage": "REJECTED_ADMIN",
    "adminVerificationStatus": "REJECTED",
    "rejectionReason": "Dokumen KRS semester 4 belum sesuai format"
  }
}
```

### 11.26 GET /api/admin/statistics

Response sukses (200):

```json
{
  "success": true,
  "message": "Statistics retrieved",
  "data": {
    "total": 57,
    "draft": 4,
    "pending": 12,
    "pendingDosenVerification": 9,
    "completed": 26,
    "approved": 26,
    "rejected": 15
  }
}
```

### 11.27 GET /api/templates/active

Response sukses (200):

```json
{
  "success": true,
  "message": "Templates aktif berhasil diambil",
  "data": [
    {
      "id": "tpl-001",
      "name": "Template Surat Pengantar",
      "type": "Generate & Template",
      "description": "Template resmi surat pengantar KP",
      "fileName": "template-surat-pengantar.docx",
      "fileUrl": "https://assets.example.com/templates/template-surat-pengantar.docx",
      "isActive": true,
      "version": 2
    }
  ]
}
```

### 11.28 GET /api/templates?type=Generate%20%26%20Template&isActive=true&search=pengantar

Response sukses (200):

```json
{
  "success": true,
  "message": "Templates berhasil diambil",
  "data": [
    {
      "id": "tpl-001",
      "name": "Template Surat Pengantar",
      "type": "Generate & Template",
      "isActive": true
    }
  ]
}
```

### 11.29 GET /api/templates/:id

Response sukses (200):

```json
{
  "success": true,
  "message": "Template berhasil diambil",
  "data": {
    "id": "tpl-001",
    "name": "Template Surat Pengantar",
    "type": "Generate & Template",
    "description": "Template resmi surat pengantar KP",
    "fileName": "template-surat-pengantar.docx",
    "fileUrl": "https://assets.example.com/templates/template-surat-pengantar.docx",
    "fields": [
      {
        "variable": "companyName",
        "label": "Nama Perusahaan",
        "type": "text",
        "required": true,
        "order": 1
      }
    ],
    "version": 2,
    "isActive": true
  }
}
```

### 11.30 POST /api/templates (multipart)

Field non-file (representasi JSON):

```json
{
  "name": "Template Surat Permohonan",
  "type": "Template Only",
  "description": "Template surat permohonan mahasiswa",
  "isActive": "true",
  "fields": "[{\"variable\":\"namaMahasiswa\",\"label\":\"Nama Mahasiswa\",\"type\":\"text\",\"required\":true,\"order\":1}]"
}
```

Form-data wajib tambahan:

- file: binary

Response sukses (201):

```json
{
  "success": true,
  "message": "Template berhasil dibuat",
  "data": {
    "id": "tpl-002",
    "name": "Template Surat Permohonan",
    "type": "Template Only",
    "isActive": true,
    "version": 1
  }
}
```

### 11.31 PUT /api/templates/:id (multipart)

Field non-file (representasi JSON):

```json
{
  "name": "Template Surat Permohonan v2",
  "description": "Update redaksi terbaru",
  "isActive": "true"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Template berhasil diupdate",
  "data": {
    "id": "tpl-002",
    "name": "Template Surat Permohonan v2",
    "isActive": true,
    "version": 2
  }
}
```

### 11.32 DELETE /api/templates/:id

Response sukses (200):

```json
{
  "success": true,
  "message": "Template berhasil dihapus"
}
```

### 11.33 PATCH /api/templates/:id/toggle-active

Response sukses (200):

```json
{
  "success": true,
  "message": "Status template berhasil diubah",
  "data": {
    "id": "tpl-001",
    "isActive": false
  }
}
```

### 11.34 GET /api/response-letters/admin?verified=true&limit=20&offset=0

Response sukses (200):

```json
{
  "success": true,
  "message": "Response letters retrieved successfully",
  "data": [
    {
      "id": "resp-001",
      "name": "Andi Pratama",
      "nim": "09031382227001",
      "company": "PT Maju Bersama",
      "status": "Disetujui",
      "adminApproved": true,
      "responseFileUrl": "https://assets.example.com/response-letters/2026-04/response-letter-sub-001-a1b2c3d4-1712499300.pdf"
    }
  ]
}
```

### 11.35 GET /api/response-letters/my

Response sukses (200, ada data):

```json
{
  "success": true,
  "message": "Response letter retrieved successfully",
  "data": {
    "id": "resp-001",
    "submissionId": "sub-001",
    "letterStatus": "approved",
    "verified": false,
    "fileUrl": "https://assets.example.com/response-letters/2026-04/response-letter-sub-001-a1b2c3d4-1712499300.pdf"
  }
}
```

Response sukses (200, belum ada):

```json
{
  "success": true,
  "message": "No response letter found",
  "data": null
}
```

### 11.36 GET /api/response-letters/:id/status

Response sukses (200):

```json
{
  "success": true,
  "message": "Response letter status retrieved successfully",
  "data": {
    "id": "resp-001",
    "verified": true,
    "letterStatus": "rejected",
    "teamWasReset": false,
    "verifiedAt": "2026-04-06T10:45:00.000Z"
  }
}
```

### 11.37 GET /api/response-letters/:id

Response sukses (200):

```json
{
  "success": true,
  "message": "Response letter retrieved successfully",
  "data": {
    "id": "resp-001",
    "submissionId": "sub-001",
    "letterStatus": "approved",
    "studentName": "Andi Pratama",
    "studentNim": "09031382227001",
    "companyName": "PT Maju Bersama",
    "memberCount": 2,
    "membersSnapshot": [
      {
        "id": 1,
        "name": "Andi Pratama",
        "nim": "09031382227001",
        "prodi": "Manajemen Informatika",
        "role": "Ketua"
      }
    ],
    "verified": true,
    "verifiedAt": "2026-04-06T10:45:00.000Z"
  }
}
```

### 11.38 DELETE /api/response-letters/admin/:id

Response sukses (200):

```json
{
  "success": true,
  "message": "Response letter deleted successfully",
  "data": null
}
```

### 11.39 GET /api/dosen/dashboard

Response sukses (200):

```json
{
  "success": true,
  "message": "Dosen dashboard retrieved",
  "data": {
    "totalMahasiswaBimbingan": 34,
    "totalSuratAjuanMasuk": 18,
    "activities": []
  }
}
```

### 11.40 GET /api/dosen/dashboard/wakdek

Response sukses (200):

```json
{
  "success": true,
  "message": "Wakil dekan dashboard retrieved",
  "data": {
    "totalAjuanSuratPengantarMasuk": 9,
    "activities": []
  }
}
```

### 11.41 GET /api/dosen/me

Response sukses (200):

```json
{
  "success": true,
  "message": "Dosen profile retrieved",
  "data": {
    "id": "dosen-001",
    "nama": "Dr. Budi Santoso",
    "email": "budi.dosen@unsri.ac.id",
    "phone": "081377771111",
    "nip": "197812102005011002",
    "jabatan": "Dosen Tetap",
    "fakultas": "Fakultas Ilmu Komputer",
    "prodi": "Manajemen Informatika",
    "esignature": {
      "url": "https://assets.example.com/esignatures/dosen-001/signature.png",
      "key": "esignatures/dosen-001/signature.png",
      "uploadedAt": "2026-04-01T08:15:00.000Z"
    }
  }
}
```

### 11.42 PUT /api/dosen/me/profile

Request JSON:

```json
{
  "nama": "Dr. Budi Santoso, M.Kom",
  "phone": "081311112222",
  "jabatan": "Dosen Tetap",
  "fakultas": "Fakultas Ilmu Komputer",
  "prodi": "Manajemen Informatika"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "dosen-001",
    "nama": "Dr. Budi Santoso, M.Kom",
    "email": "budi.dosen@unsri.ac.id",
    "phone": "081311112222",
    "nip": "197812102005011002",
    "jabatan": "Dosen Tetap",
    "fakultas": "Fakultas Ilmu Komputer",
    "prodi": "Manajemen Informatika"
  }
}
```

### 11.43 PUT /api/dosen/me/esignature (multipart)

Field non-file (representasi JSON):

```json
{}
```

Form-data wajib tambahan:

- signatureFile: binary png/jpg/jpeg max 2MB

Response sukses (200):

```json
{
  "success": true,
  "message": "E-signature updated",
  "data": {
    "url": "https://assets.example.com/esignatures/dosen-001/signature-new.png",
    "key": "esignatures/dosen-001/signature-new.png",
    "uploadedAt": "2026-04-06T12:30:00.000Z"
  }
}
```

### 11.44 DELETE /api/dosen/me/esignature

Response sukses (200):

```json
{
  "success": true,
  "message": "E-signature deleted",
  "data": null
}
```

### 11.45 GET /api/dosen/surat-kesediaan/requests

Response sukses (200):

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": "skd-001",
      "tanggal": "2026-04-06",
      "nim": "09031382227002",
      "namaMahasiswa": "Dewi Lestari",
      "programStudi": "Manajemen Informatika",
      "jenisSurat": "Surat Kesediaan",
      "status": "MENUNGGU",
      "dosenNama": "Dr. Budi Santoso",
      "signedFileUrl": null
    }
  ]
}
```

### 11.46 PUT /api/dosen/surat-kesediaan/requests/:requestId/approve

Response sukses (200):

```json
{
  "success": true,
  "message": "Pengajuan berhasil disetujui dan surat telah ditandatangani",
  "data": {
    "requestId": "skd-001",
    "status": "DISETUJUI",
    "approvedAt": "2026-04-06T12:40:00.000Z",
    "signedFileUrl": "https://assets.example.com/surat-kesediaan/signed/surat-kesediaan-signed-skd-001.pdf"
  }
}
```

### 11.47 PUT /api/dosen/surat-kesediaan/requests/approve-bulk

Request JSON:

```json
{
  "requestIds": [
    "skd-001",
    "skd-002"
  ]
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "2 pengajuan berhasil disetujui",
  "data": {
    "approvedCount": 2,
    "failed": []
  }
}
```

### 11.48 PUT /api/mahasiswa/surat-kesediaan/requests/:requestId/reapply

Request JSON:

```json
{
  "memberUserId": "user-anggota-001"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Pengajuan ulang surat kesediaan berhasil.",
  "data": {
    "requestId": "skd-001",
    "status": "MENUNGGU"
  }
}
```

### 11.49 GET /api/dosen/surat-permohonan/requests

Response sukses (200):

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": "spm-001",
      "tanggal": "2026-04-06",
      "nim": "09031382227002",
      "namaMahasiswa": "Dewi Lestari",
      "programStudi": "Manajemen Informatika",
      "jenisSurat": "Surat Permohonan",
      "status": "MENUNGGU",
      "mahasiswaEsignatureUrl": "https://assets.example.com/esignatures/user-anggota-001/signature.png",
      "signedFileUrl": null
    }
  ]
}
```

### 11.50 PUT /api/dosen/surat-permohonan/requests/:requestId/approve

Response sukses (200):

```json
{
  "success": true,
  "message": "Pengajuan surat permohonan berhasil disetujui",
  "data": {
    "requestId": "spm-001",
    "status": "DISETUJUI",
    "approvedAt": "2026-04-06T12:55:00.000Z",
    "signedFileUrl": "https://assets.example.com/surat-permohonan/signed/surat-permohonan-signed-spm-001.pdf"
  }
}
```

### 11.51 PUT /api/dosen/surat-permohonan/requests/approve-bulk

Request JSON:

```json
{
  "requestIds": [
    "spm-001",
    "spm-002"
  ]
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "2 pengajuan berhasil disetujui",
  "data": {
    "approvedCount": 2,
    "failed": []
  }
}
```

### 11.52 PUT /api/dosen/surat-permohonan/requests/:requestId/reject

Request JSON:

```json
{
  "rejection_reason": "Data perusahaan pada submission belum lengkap"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Pengajuan surat permohonan berhasil ditolak",
  "data": {
    "requestId": "spm-001",
    "status": "DITOLAK",
    "rejectionReason": "Data perusahaan pada submission belum lengkap",
    "rejectedAt": "2026-04-06T13:00:00.000Z"
  }
}
```

### 11.53 PUT /api/mahasiswa/surat-permohonan/requests/:requestId/reapply

Request JSON:

```json
{
  "memberUserId": "user-anggota-001"
}
```

Response sukses (200):

```json
{
  "success": true,
  "message": "Pengajuan ulang surat permohonan berhasil.",
  "data": {
    "requestId": "spm-001",
    "status": "MENUNGGU"
  }
}
```

### 11.54 GET /api/dosen/surat-pengantar/requests

Response sukses (200):

```json
{
  "success": true,
  "message": "Daftar pengajuan surat pengantar berhasil diambil",
  "data": [
    {
      "id": "sub-001",
      "requestId": "sub-001",
      "submissionId": "sub-001",
      "teamId": "team-001",
      "teamCode": "TEAM-AB12CD",
      "nim": "09031382227001",
      "namaMahasiswa": "Andi Pratama",
      "programStudi": "Manajemen Informatika",
      "status": "MENUNGGU",
      "isAdminApproved": true,
      "adminStatus": "APPROVED",
      "submissionStatus": "PENDING_DOSEN_VERIFICATION",
      "companyName": "PT Maju Bersama",
      "approvedAt": null,
      "signedFileUrl": null,
      "letterNumber": "001/MI-FASILKOM-UNSRI/IV/2026"
    }
  ]
}
```

### 11.55 PUT /api/dosen/surat-pengantar/requests/:requestId/approve

Response sukses (200):

```json
{
  "success": true,
  "message": "Pengajuan surat pengantar berhasil disetujui",
  "data": {
    "requestId": "sub-001",
    "submissionId": "sub-001",
    "status": "approved",
    "approvedAt": "2026-04-06T13:10:00.000Z",
    "approved_at": "2026-04-06T13:10:00.000Z",
    "signedFileUrl": "https://assets.example.com/surat-pengantar/final/surat-pengantar-final-sub-001.pdf",
    "signed_file_url": "https://assets.example.com/surat-pengantar/final/surat-pengantar-final-sub-001.pdf"
  }
}
```

### 11.56 GET /api/utils/document-types

Response sukses (200):

```json
{
  "success": true,
  "message": "Document types retrieved",
  "data": [
    "PROPOSAL_KETUA",
    "SURAT_KESEDIAAN",
    "FORM_PERMOHONAN",
    "KRS_SEMESTER_4",
    "DAFTAR_KUMPULAN_NILAI",
    "BUKTI_PEMBAYARAN_UKT"
  ]
}
```

### 11.57 GET /api/utils/document-types/all

Response sukses (200):

```json
{
  "success": true,
  "message": "All document types retrieved",
  "data": [
    "PROPOSAL_KETUA",
    "SURAT_KESEDIAAN",
    "FORM_PERMOHONAN",
    "KRS_SEMESTER_4",
    "DAFTAR_KUMPULAN_NILAI",
    "BUKTI_PEMBAYARAN_UKT",
    "SURAT_PENGANTAR"
  ]
}
```

### 11.58 GET /api/assets/r2/*

Request contoh URL:

```json
{
  "url": "/api/assets/r2/esignatures/user-ketua-001/signature.png"
}
```

Response sukses (200):

```json
{
  "type": "binary",
  "description": "File image signature dari R2 dikembalikan sebagai binary stream"
}
```

Response error path tidak diizinkan (403):

```json
{
  "success": false,
  "message": "Forbidden asset path"
}
```

### 11.59 GET /api/templates/:id/download

Request contoh URL:

```json
{
  "url": "/api/templates/tpl-001/download"
}
```

Response sukses (200):

```json
{
  "type": "binary",
  "description": "File template dikembalikan sebagai attachment"
}
```

### 11.60 Ringkasan Endpoint Alias yang Payload-nya Sama

Endpoint berikut menggunakan handler yang sama, sehingga payload request/response mengikuti contoh pada endpoint utama yang sudah didokumentasikan:

- PATCH /api/submissions/:submissionId (sama dengan PUT update submission).
- PUT /api/submissions/:submissionId/submit (sama dengan POST submit).
- PATCH /api/mahasiswa/surat-permohonan/requests/:requestId/reapply (sama dengan PUT reapply surat permohonan).
- POST /api/mahasiswa/surat-permohonan/requests/:requestId/reapply (sama dengan PUT reapply surat permohonan).
- POST /api/mahasiswa/surat-permohonan/request (sama dengan POST /requests).
