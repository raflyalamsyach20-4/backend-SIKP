#!/bin/bash

# Test upload file to Workers endpoint
# Ganti nilai variabel di bawah dengan data sebenarnya

WORKERS_URL="https://backend-sikp.workers.dev"
TOKEN="your-jwt-token-here"  # Ganti dengan token login
SUBMISSION_ID="1769274850536-26y56cx52"  # Ganti dengan submission ID
MEMBER_USER_ID="user_id_here"  # Ganti dengan user ID
FILE_PATH="./test.pdf"  # Ganti dengan path file test

echo "Testing file upload to Workers..."
echo "Endpoint: $WORKERS_URL/api/submissions/$SUBMISSION_ID/documents"

curl -X POST "$WORKERS_URL/api/submissions/$SUBMISSION_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$FILE_PATH" \
  -F "documentType=PROPOSAL_KETUA" \
  -F "memberUserId=$MEMBER_USER_ID" \
  -v

echo "\n\nIf successful, check R2 bucket with:"
echo "npx wrangler r2 object list document-sikp-mi"
