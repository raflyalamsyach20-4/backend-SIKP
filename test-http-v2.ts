/**
 * Test HTTP Endpoint - Simple version using seed user credentials
 * Uses the ANGGOTA member directly from database
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);
const BASE_URL = process.env.WORKER_URL || 'http://localhost:8787';

async function testHTTPSimple() {
  console.log('\n🧪 HTTP ENDPOINT TEST - Leave Team (v2)\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('═'.repeat(70));

  try {
    // 1. Get ANGGOTA member (not leader)
    console.log('\n📋 STEP 1: Getting test data...\n');

    const result = await sql`
      SELECT 
        tm.id as member_id,
        tm.user_id,
        tm.team_id,
        u.email,
        u.password as password_hash,
        t.code as team_code,
        t.leader_id
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      JOIN teams t ON tm.team_id = t.id
      WHERE tm.role = 'ANGGOTA' 
        AND tm.invitation_status = 'ACCEPTED'
        AND t.leader_id != tm.user_id
      LIMIT 1
    `;

    if (result.length === 0) {
      console.error('❌ No ANGGOTA member found');
      process.exit(1);
    }

    const testData = result[0];
    const email = testData.email;
    // Use specific passwords based on email
    let userPassword = 'password123'; // default
    if (email === 'rafly@gmail.com') userPassword = 'rafly123';
    if (email === 'hikmah@gmail.com') userPassword = 'hikmah123';
    
    const teamId = testData.team_id;
    const teamCode = testData.team_code;

    console.log(`✅ Found user: ${email}`);
    console.log(`✅ Team: ${teamCode}`);
    console.log(`✅ Will use password: ${userPassword}`);

    // 2. Try login
    console.log('\n📊 STEP 2: Attempting login...\n');

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: userPassword,
      }),
    });

    const loginJson = await loginRes.json();

    if (!loginRes.ok) {
      console.error(`❌ Login failed: ${loginRes.status}`);
      console.error(`Message: ${loginJson.message}`);

      // Try to debug what's in auth controller
      console.error(`\nℹ️ Response:`, loginJson);

      // Let's check if password needs hashing
      console.log('\n📋 Debugging: Checking password field...');
      const userCheck = await sql`
        SELECT password FROM users WHERE email = ${email}
      `;

      console.log(
        `Password stored (first 20 chars): ${(userCheck[0]?.password || 'MISSING').substring(0, 20)}...`
      );

      // Try to compare with bcrypt
      const isMatch = await bcrypt.compare(
        userPassword,
        userCheck[0]?.password || ''
      );
      console.log(`Bcrypt match result: ${isMatch}`);

      process.exit(1);
    }

    const token = loginJson.data?.token;
    if (!token) {
      console.error('❌ No token in response');
      console.error('Response:', loginJson);
      process.exit(1);
    }

    console.log(`✅ Login successful!`);
    console.log(`✅ Token: ${token.substring(0, 30)}...`);

    // 3. Get teams before leave
    console.log('\n📊 STEP 3: GET /teams/my-teams (BEFORE leave)...\n');

    const beforeRes = await fetch(`${BASE_URL}/api/teams/my-teams`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!beforeRes.ok) {
      console.error(`❌ GET failed: ${beforeRes.status}`);
      console.error('Response:', await beforeRes.text());
      process.exit(1);
    }

    const beforeData = await beforeRes.json();
    const teams = beforeData.data || [];
    const teamBefore = teams.find((t: any) => t.id === teamId);

    if (teamBefore) {
      console.log(`✅ Team found: ${teamBefore.code}`);
      console.log(`✅ Members: ${teamBefore.members.length}`);
      console.log(`✅ isLeader: ${teamBefore.isLeader}`);
    } else {
      console.warn(`⚠️ Team not found before leave`);
    }

    // 4. Call leave endpoint
    console.log('\n📊 STEP 4: POST /teams/:teamId/leave...\n');

    const leaveRes = await fetch(`${BASE_URL}/api/teams/${teamId}/leave`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const leaveJson = await leaveRes.json();

    if (!leaveRes.ok) {
      console.error(`❌ Leave failed: ${leaveRes.status}`);
      console.error('Response:', leaveJson);
      process.exit(1);
    }

    console.log(`✅ Leave endpoint returned 200`);
    console.log(`✅ Message: ${leaveJson.message}`);

    // 5. Verify in database
    console.log('\n📊 STEP 5: Database verification...\n');

    const verify = await sql`
      SELECT id FROM team_members
      WHERE team_id = ${teamId} AND user_id = ${testData.user_id}
    `;

    if (verify.length === 0) {
      console.log(`✅ Member deleted from database`);
    } else {
      console.error(`❌ Member still in database!`);
      process.exit(1);
    }

    // 6. Check teams after leave
    console.log('\n📊 STEP 6: GET /teams/my-teams (AFTER leave)...\n');

    const afterRes = await fetch(`${BASE_URL}/api/teams/my-teams`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const afterData = await afterRes.json();
    const teamsAfter = afterData.data || [];
    const teamAfter = teamsAfter.find((t: any) => t.id === teamId);

    if (!teamAfter) {
      console.log(`✅ Team removed from my-teams list`);
    } else {
      console.error(`❌ Team still in list!`);
      process.exit(1);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('\n🎉 ALL TESTS PASSED!\n');
  } catch (error: any) {
    console.error('\n💥 Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testHTTPSimple();
