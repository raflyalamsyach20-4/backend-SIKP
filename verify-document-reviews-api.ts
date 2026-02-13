import { config } from 'dotenv';
config();

const BASE_URL = 'https://backend-sikp.backend-sikp.workers.dev';

// Test credentials - replace with actual admin credentials
const ADMIN_LOGIN = {
  email: 'admintest@gmail.com', // Replace with actual admin email
  password: 'admin123', // Replace with actual admin password
};

async function login() {
  console.log('🔐 Logging in as admin...');
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN_LOGIN),
  });

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(`Login failed: ${data.message}`);
  }

  console.log('✅ Logged in successfully');
  console.log('   User:', data.data.user.nama);
  console.log('   Role:', data.data.user.role);
  
  return data.data.token;
}

async function testGetSubmissions(token: string) {
  console.log('\n📊 Testing GET /api/admin/submissions');
  
  const response = await fetch(`${BASE_URL}/api/admin/submissions`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  
  console.log('Status:', response.status);
  console.log('Success:', data.success);
  console.log('Total submissions:', data.data?.length || 0);
  
  if (data.data?.length > 0) {
    const submission = data.data[0];
    console.log('\n🔍 First Submission Analysis:');
    console.log('   ID:', submission.id);
    console.log('   Status:', submission.status);
    console.log('   Has documentReviews:', !!submission.documentReviews);
    console.log('   documentReviews type:', typeof submission.documentReviews);
    console.log('   documentReviews:', JSON.stringify(submission.documentReviews, null, 2));
    
    if (submission.documents?.length > 0) {
      console.log('\n📎 Documents:');
      submission.documents.forEach((doc: any, i: number) => {
        const reviewStatus = submission.documentReviews?.[doc.id] || 'no review';
        console.log(`   ${i + 1}. ${doc.documentType} (${doc.id})`);
        console.log(`      Review: ${reviewStatus}`);
      });
    }
    
    // Check if any document has review status
    if (submission.documentReviews && Object.keys(submission.documentReviews).length > 0) {
      console.log('\n✅ documentReviews is present! Frontend should show colors.');
    } else {
      console.log('\n⚠️  documentReviews is empty. Colors won\'t show.');
    }
  }
}

async function testGetSubmissionById(token: string, submissionId: string) {
  console.log(`\n📄 Testing GET /api/admin/submissions/${submissionId}`);
  
  const response = await fetch(`${BASE_URL}/api/admin/submissions/${submissionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  
  console.log('Status:', response.status);
  console.log('Success:', data.success);
  
  if (data.success && data.data) {
    const submission = data.data;
    console.log('\n🔍 Submission Details:');
    console.log('   ID:', submission.id);
    console.log('   Status:', submission.status);
    console.log('   Has documentReviews:', !!submission.documentReviews);
    console.log('   documentReviews:', JSON.stringify(submission.documentReviews, null, 2));
    
    if (submission.documents?.length > 0) {
      console.log('\n📎 Documents with Review Status:');
      submission.documents.forEach((doc: any, i: number) => {
        const reviewStatus = submission.documentReviews?.[doc.id] || 'no review';
        const emoji = reviewStatus === 'approved' ? '🟢' : reviewStatus === 'rejected' ? '🔴' : '⚪';
        console.log(`   ${emoji} ${doc.documentType}`);
        console.log(`      ID: ${doc.id}`);
        console.log(`      Status: ${reviewStatus}`);
      });
    }
  }
}

async function main() {
  try {
    // Login
    const token = await login();
    
    // Test GET all submissions
    await testGetSubmissions(token);
    
    // Test GET specific submission (use the ID from previous output)
    const specificId = '1770812139864-8fnbcc1kw'; // Replace with actual ID if different
    await testGetSubmissionById(token, specificId);
    
    console.log('\n✅ All tests completed!');
    console.log('\n💡 Next steps:');
    console.log('   1. Check the output above for documentReviews data');
    console.log('   2. If documentReviews is present, refresh the frontend');
    console.log('   3. You should see colored indicators (🟢 green for approved, 🔴 red for rejected)');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', await error.response.text());
    }
  }
}

main();
