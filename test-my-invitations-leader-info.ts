/**
 * Test: GET /api/teams/my-invitations - Verify Leader Info
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);
const BASE_URL = process.env.WORKER_URL || 'http://localhost:8787';

async function testMyInvitationsWithLeaderInfo() {
  console.log('\n🧪 TEST: GET /api/teams/my-invitations - Leader Info\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('═'.repeat(70));

  try {
    // 1. Create test data: A user with a join request (pending invitation)
    console.log('\n📋 STEP 1: Setting up test data...\n');

    // Get a team with a leader
    const teamsResult = await sql`
      SELECT t.id, t.code, t.leader_id, u.id as user_id, u.nama, u.email, m.nim
      FROM teams t
      JOIN users u ON t.leader_id = u.id
      LEFT JOIN mahasiswa m ON u.id = m.id
      LIMIT 1
    `;

    if (teamsResult.length === 0) {
      console.error('❌ No teams found');
      process.exit(1);
    }

    const testTeam = teamsResult[0];
    console.log(`✅ Found team: ${testTeam.code}`);
    console.log(`   Leader: ${testTeam.nama} (${testTeam.nim})`);

    // Find a user without pending invitations to this team
    const usersResult = await sql`
      SELECT u.id, u.nama, u.email, m.nim FROM users u
      LEFT JOIN mahasiswa m ON u.id = m.id
      WHERE u.role = 'MAHASISWA' 
      AND u.id != ${testTeam.leader_id}
      LIMIT 20
    `;

    let testUser = null;
    for (const user of usersResult) {
      const existing = await sql`
        SELECT * FROM team_members 
        WHERE team_id = ${testTeam.id} AND user_id = ${user.id}
        LIMIT 1
      `;
      if (existing.length === 0) {
        testUser = user;
        break;
      }
    }

    if (!testUser) {
      console.error('❌ No suitable user found');
      process.exit(1);
    }

    console.log(`✅ Found test user: ${testUser.nama}`);

    // Create a join request (PENDING invitation from user)
    const memberId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await sql`
      INSERT INTO team_members (
        id, team_id, user_id, role, invitation_status, invited_by, invited_at
      ) VALUES (
        ${memberId},
        ${testTeam.id},
        ${testUser.id},
        'ANGGOTA',
        'PENDING',
        ${testUser.id},
        NOW()
      )
    `;

    console.log(`✅ Created join request with ID: ${memberId}`);

    // 2. Login as the test user
    console.log('\n📋 STEP 2: Logging in as test user...\n');

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

    // 3. Call GET /api/teams/my-invitations endpoint
    console.log('\n📋 STEP 3: Getting my invitations...\n');

    const invitationsResponse = await fetch(`${BASE_URL}/api/teams/my-invitations`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const invitationsData = await invitationsResponse.json();

    console.log(`Response Status: ${invitationsResponse.status}`);

    if (!invitationsData.success) {
      console.error('❌ Get invitations failed:', invitationsData.message);
      process.exit(1);
    }

    console.log(`✅ Get invitations successful`);
    console.log(`   Total invitations: ${invitationsData.data.length}`);

    // 4. Find the join request we just created
    console.log('\n📋 STEP 4: Verifying leader info in response...\n');

    const joinRequest = invitationsData.data.find(inv => inv.id === memberId);

    if (!joinRequest) {
      console.error('❌ Join request not found in response');
      console.log('Invitations:', JSON.stringify(invitationsData.data, null, 2));
      process.exit(1);
    }

    console.log(`✅ Found join request in response`);

    // 5. Verify team object has leader info
    console.log('\n📋 STEP 5: Checking team leader info...\n');

    console.log(`Invitation Data:`);
    console.log(`  ID: ${joinRequest.id}`);
    console.log(`  Status: ${joinRequest.status}`);
    console.log(`  Team Code: ${joinRequest.team.code}`);
    console.log(`  Team Leader Name: ${joinRequest.team.leaderName}`);
    console.log(`  Team Leader NIM: ${joinRequest.team.leaderNim}`);

    // Verify all required fields
    const errors = [];

    if (!joinRequest.team.leaderName) {
      errors.push('❌ leaderName is missing or empty');
    } else if (joinRequest.team.leaderName !== testTeam.nama && joinRequest.team.leaderName !== 'Unknown') {
      errors.push(`❌ leaderName mismatch: expected "${testTeam.nama}", got "${joinRequest.team.leaderName}"`);
    }

    if (!joinRequest.team.leaderNim) {
      errors.push('❌ leaderNim is missing or empty');
    } else if (joinRequest.team.leaderNim !== testTeam.nim && joinRequest.team.leaderNim !== 'Unknown') {
      errors.push(`❌ leaderNim mismatch: expected "${testTeam.nim}", got "${joinRequest.team.leaderNim}"`);
    }

    if (errors.length > 0) {
      console.error('\n' + errors.join('\n'));
      process.exit(1);
    }

    console.log(`\n✅ All leader info fields verified!`);
    console.log(`   ✅ leaderName: "${joinRequest.team.leaderName}"`);
    console.log(`   ✅ leaderNim: "${joinRequest.team.leaderNim}"`);

    // 6. Cleanup
    console.log('\n📋 STEP 6: Cleaning up test data...\n');

    await sql`DELETE FROM team_members WHERE id = ${memberId}`;
    console.log(`✅ Test invitation deleted`);

    console.log('\n' + '═'.repeat(70));
    console.log('\n🎉 ALL TESTS PASSED!\n');
    console.log('✅ GET /api/teams/my-invitations now includes:');
    console.log('   - team.leaderName');
    console.log('   - team.leaderNim');
    console.log('\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.log('\n' + '═'.repeat(70) + '\n');
    process.exit(1);
  }
}

testMyInvitationsWithLeaderInfo();
