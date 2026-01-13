# API Testing Collection

## Environment Variables
```
BASE_URL=http://localhost:8787
TOKEN=your-jwt-token-here
```

## Authentication

### Register (Mahasiswa)
```bash
curl -X POST {{BASE_URL}}/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "nim": "12345678",
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "MAHASISWA"
  }'
```

### Register (Admin)
```bash
curl -X POST {{BASE_URL}}/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "nim": "ADMIN001",
    "name": "Admin User",
    "email": "admin@university.edu",
    "password": "admin123",
    "role": "ADMIN"
  }'
```

### Login
```bash
curl -X POST {{BASE_URL}}/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "nim": "12345678",
    "password": "password123"
  }'
```

### Get Profile
```bash
curl -X GET {{BASE_URL}}/api/auth/me \
  -H "Authorization: Bearer {{TOKEN}}"
```

## Teams

### Create Team
```bash
curl -X POST {{BASE_URL}}/api/teams \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tim KP 2024 - PT. Example"
  }'
```

### Invite Member
```bash
curl -X POST {{BASE_URL}}/api/teams/{teamId}/invite \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "memberNim": "87654321"
  }'
```

### Respond to Invitation
```bash
curl -X POST {{BASE_URL}}/api/teams/invitations/{memberId}/respond \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "accept": true
  }'
```

### Get My Teams
```bash
curl -X GET {{BASE_URL}}/api/teams/my-teams \
  -H "Authorization: Bearer {{TOKEN}}"
```

## Submissions

### Create Submission
```bash
curl -X POST {{BASE_URL}}/api/submissions \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "teamId": "team-id-here"
  }'
```

### Update Submission
```bash
curl -X PATCH {{BASE_URL}}/api/submissions/{submissionId} \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "PT. Technology Indonesia",
    "companyAddress": "Jl. Sudirman No. 123, Jakarta",
    "companyPhone": "021-1234567",
    "companyEmail": "hr@technology.com",
    "companySupervisor": "Budi Santoso",
    "position": "Backend Developer",
    "startDate": "2024-03-01",
    "endDate": "2024-06-01",
    "description": "Kerja praktik di bagian development"
  }'
```

### Submit for Review
```bash
curl -X POST {{BASE_URL}}/api/submissions/{submissionId}/submit \
  -H "Authorization: Bearer {{TOKEN}}"
```

### Upload Document
```bash
curl -X POST {{BASE_URL}}/api/submissions/{submissionId}/documents \
  -H "Authorization: Bearer {{TOKEN}}" \
  -F "file=@/path/to/document.pdf" \
  -F "documentType=KTP"
```

### Get My Submissions
```bash
curl -X GET {{BASE_URL}}/api/submissions/my-submissions \
  -H "Authorization: Bearer {{TOKEN}}"
```

## Admin

### Get All Submissions
```bash
curl -X GET {{BASE_URL}}/api/admin/submissions \
  -H "Authorization: Bearer {{TOKEN}}"
```

### Get Submissions by Status
```bash
curl -X GET {{BASE_URL}}/api/admin/submissions/status/MENUNGGU \
  -H "Authorization: Bearer {{TOKEN}}"
```

### Get Submission Detail
```bash
curl -X GET {{BASE_URL}}/api/admin/submissions/{submissionId} \
  -H "Authorization: Bearer {{TOKEN}}"
```

### Approve Submission
```bash
curl -X POST {{BASE_URL}}/api/admin/submissions/{submissionId}/approve \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "autoGenerateLetter": true
  }'
```

### Reject Submission
```bash
curl -X POST {{BASE_URL}}/api/admin/submissions/{submissionId}/reject \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Dokumen tidak lengkap"
  }'
```

### Generate Letter
```bash
curl -X POST {{BASE_URL}}/api/admin/submissions/{submissionId}/generate-letter \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "pdf"
  }'
```

### Get Statistics
```bash
curl -X GET {{BASE_URL}}/api/admin/statistics \
  -H "Authorization: Bearer {{TOKEN}}"
```
