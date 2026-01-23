/**
 * Test Join Team HTTP Endpoint
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);
const BASE_URL = process.env.WORKER_URL || 'http://localhost:8787';

async function testJoinTeamEndpoint() {
  console.log('\n🧪 TEST: Join Team HTTP Endpoint\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('═'.repeat(70));

  try {
    // 1. Find a team with available slots
    console.log('\n📋 STEP 1: Finding a team with available slots...\n');

    const teamsData = await sql`
      SELECT t.*, (
        SELECT COUNT(*) FROM team_members tm 
        WHERE tm.team_id = t.id AND tm.invitation_status = 'ACCEPTED'
      ) as accepted_count
      FROM teams t
      WHERE t.status = 'PENDING'
      LIMIT 5
    `;

    if (teamsData.length === 0) {
      console.error('❌ No teams found in database');
      process.exit(1);
    }

    let testTeam = null;
    for (const team of teamsData) {
      if (team.accepted_count < 3) {
        testTeam = team;
        break;
      }
    }

    if (!testTeam) {
      console.error('❌ No teams with available slots found');
      process.exit(1);
    }

    console.log(`✅ Found team: ${testTeam.code} (ID: ${testTeam.id})`);
    console.log(`   Accepted members: ${testTeam.accepted_count}/3`);

    // 2. Find a user to join the team
    console.log('\n📋 STEP 2: Finding a user to join the team...\n');

    const usersData = await sql`
      SELECT u.* FROM users u 
      WHERE u.role = 'MAHASISWA' 
      AND u.id != ${testTeam.leader_id}
      LIMIT 20
    `;

    let testUser = null;
    for (const user of usersData) {
      // Check if already member of this team
      const existingMem = await sql`
        SELECT * FROM team_members 
        WHERE team_id = ${testTeam.id} AND user_id = ${user.id}
        LIMIT 1
      `;

      if (existingMem.length > 0) {
        continue;
      }

      // Check if in other ACCEPTED teams
      const otherTeams = await sql`
        SELECT * FROM team_members 
        WHERE user_id = ${user.id} AND invitation_status = 'ACCEPTED'
        LIMIT 1
      `;

      if (otherTeams.length === 0) {
        testUser = user;
        break;
      }
    }

    if (!testUser) {
      console.error('❌ No suitable user found for join test');
      process.exit(1);
    }

    console.log(`✅ Found user: ${testUser.nama}`);
    console.log(`   Email: ${testUser.email}`);

    // 3. Login as the test user
    console.log('\n📋 STEP 3: Logging in as test user...\n');

    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: 'password123',
      }),
    });

    const loginData = await loginResponse.json();

    if (!loginData.success) {
      console.error('❌ Login failed:', loginData.message);
      process.exit(1);
    }

    const token = loginData.data.token;
    console.log(`✅ Login successful`);
    console.log(`   Token: ${token.substring(0, 20)}...`);

    // 4. Call join team endpoint
    console.log(`\n📋 STEP 4: Calling POST /api/teams/${testTeam.code}/join...\n`);

    const joinResponse = await fetch(`${BASE_URL}/api/teams/${testTeam.code}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    const joinData = await joinResponse.json();

    console.log(`Response Status: ${joinResponse.status}`);
    console.log(`Response:`, JSON.stringify(joinData, null, 2));

    if (!joinData.success) {
      console.error('❌ Join request failed:', joinData.message);
      process.exit(1);
    }

    console.log(`✅ Join request successful`);
    console.log(`   Member ID: ${joinData.data.memberId}`);
    console.log(`   Status: ${joinData.data.status}`);
    console.log(`   Team Code: ${joinData.data.teamCode}`);

    // 5. Verify in database
    console.log('\n📋 STEP 5: Verifying join request in database...\n');

    const verifyResult = await sql`
      SELECT * FROM team_members 
      WHERE team_id = ${testTeam.id} AND user_id = ${testUser.id}
      LIMIT 1
    `;

    if (verifyResult.length === 0) {
      console.error(`❌ Join request not found in database!`);
      process.exit(1);
    }

    const verified = verifyResult[0];
    console.log(`✅ Join request verified in database`);
    console.log(`   ID: ${verified.id}`);
    console.log(`   Status: ${verified.invitation_status}`);
    console.log(`   Role: ${verified.role}`);
    console.log(`   Invited by: ${verified.invited_by}`);

    if (verified.invitation_status !== 'PENDING') {
      console.error(`❌ Expected status PENDING, got ${verified.invitation_status}`);
      process.exit(1);
    }

    if (verified.role !== 'ANGGOTA') {
      console.error(`❌ Expected role ANGGOTA, got ${verified.role}`);
      process.exit(1);
    }

    if (verified.invited_by !== testUser.id) {
      console.error(`❌ Expected invited_by to be ${testUser.id}, got ${verified.invited_by}`);
      process.exit(1);
    }

    console.log(`✅ All fields correct`);

    // 6. Test duplicate prevention
    console.log('\n📋 STEP 6: Testing duplicate join request prevention...\n');

    const duplicateResponse = await fetch(`${BASE_URL}/api/teams/${testTeam.code}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    const duplicateData = await duplicateResponse.json();

    console.log(`Response Status: ${duplicateResponse.status}`);
    console.log(`Response:`, JSON.stringify(duplicateData, null, 2));

    if (duplicateData.success) {
      console.error(`❌ Duplicate join request was allowed!`);
      process.exit(1);
    }

    if (duplicateData.message.includes('sudah mengirim permintaan')) {
      console.log(`✅ Duplicate join request prevented correctly`);
    } else {
      console.log(`✅ Duplicate prevented with message: ${duplicateData.message}`);
    }

    // 7. Cleanup
    console.log('\n📋 STEP 7: Cleaning up test data...\n');

    await sql`DELETE FROM team_members WHERE id = ${verified.id}`;
    console.log(`✅ Test join request deleted`);

    // Verify cleanup
    const cleanupVerify = await sql`
      SELECT * FROM team_members WHERE id = ${verified.id}
    `;

    if (cleanupVerify.length === 0) {
      console.log(`✅ Cleanup verified - record deleted from database`);
    } else {
      console.error(`❌ Cleanup failed - record still exists!`);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('\n🎉 ALL TESTS PASSED!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.log('\n' + '═'.repeat(70) + '\n');
    process.exit(1);
  }
}

testJoinTeamEndpoint();
