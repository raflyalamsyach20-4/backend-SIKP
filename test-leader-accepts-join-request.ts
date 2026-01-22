/**
 * Test: POST /api/teams/invitations/:memberId/respond - Leader Accepts Join Request
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);
const BASE_URL = process.env.WORKER_URL || 'http://localhost:8787';

async function testLeaderAcceptsJoinRequest() {
  console.log('\n🧪 TEST: Leader Accepts Join Request\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('═'.repeat(70));

  try {
    // 1. Setup: Get Budi's team (from seed data)
    console.log('\n📋 STEP 1: Setting up test data...\n');

    const teamsResult = await sql`
      SELECT t.id, t.code, t.leader_id, u.email as leader_email
      FROM teams t
      JOIN users u ON t.leader_id = u.id
      WHERE u.email = 'budi.santoso@student.univ.ac.id'
      LIMIT 1
    `;

    if (teamsResult.length === 0) {
      console.error('❌ No teams found');
      process.exit(1);
    }

    const testTeam = teamsResult[0];
    console.log(`✅ Found team: ${testTeam.code}`);
    console.log(`   Leader ID: ${testTeam.leader_id}`);

    // Find Siti Nurhaliza to send join request (from seed data)
    const usersResult = await sql`
      SELECT u.id, u.email FROM users u
      WHERE u.email = 'siti.nurhaliza@student.univ.ac.id'
      LIMIT 1
    `;

    if (usersResult.length === 0) {
      console.error('❌ Siti not found');
      process.exit(1);
    }

    const testUser = usersResult[0];
    console.log(`✅ Test user: ${testUser.email}`);

    // Create join request (invited_by = user's own ID - self-initiated)
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

    // 2. Login as team leader
    console.log('\n📋 STEP 2: Logging in as team leader...\n');

    // Note: Using password from seed data (password123 for mahasiswa)
    const leaderLoginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testTeam.leader_email,
        password: 'password123',
      }),
    });

    const leaderLoginData = await leaderLoginResponse.json();

    if (!leaderLoginData.success) {
      console.error('❌ Leader login failed:', leaderLoginData.message);
      process.exit(1);
    }

    const leaderToken = leaderLoginData.data.token;
    console.log(`✅ Leader login successful`);

    // 3. Leader accepts join request
    console.log('\n📋 STEP 3: Leader accepts join request...\n');

    const acceptResponse = await fetch(`${BASE_URL}/api/teams/invitations/${memberId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${leaderToken}`,
      },
      body: JSON.stringify({ accept: true }),
    });

    const acceptData = await acceptResponse.json();

    console.log(`Response Status: ${acceptResponse.status}`);
    console.log(`Response:`, JSON.stringify(acceptData, null, 2));

    if (!acceptData.success) {
      console.error('❌ Accept failed:', acceptData.message);
      process.exit(1);
    }

    console.log(`✅ Accept successful`);
    console.log(`   Status: ${acceptData.member?.invitationStatus}`);

    // 4. Verify in database
    console.log('\n📋 STEP 4: Verifying in database...\n');

    const verifyResult = await sql`
      SELECT * FROM team_members
      WHERE id = ${memberId}
      LIMIT 1
    `;

    if (verifyResult.length === 0) {
      console.error('❌ Member record not found');
      process.exit(1);
    }

    const verified = verifyResult[0];
    console.log(`✅ Member record verified`);
    console.log(`   Status: ${verified.invitation_status}`);
    console.log(`   Responded at: ${verified.responded_at}`);

    if (verified.invitation_status !== 'ACCEPTED') {
      console.error(`❌ Expected ACCEPTED, got ${verified.invitation_status}`);
      process.exit(1);
    }

    if (!verified.responded_at) {
      console.error(`❌ responded_at should be set`);
      process.exit(1);
    }

    console.log(`✅ All fields verified!`);

    // 5. Test Case 2: Leader rejects join request
    console.log('\n📋 STEP 5: Testing reject functionality...\n');

    // Create another join request
    const memberId2 = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await sql`
      INSERT INTO team_members (
        id, team_id, user_id, role, invitation_status, invited_by, invited_at
      ) VALUES (
        ${memberId2},
        ${testTeam.id},
        ${testUser.id},
        'ANGGOTA',
        'PENDING',
        ${testUser.id},
        NOW()
      )
    `;

    console.log(`✅ Created second join request: ${memberId2}`);

    const rejectResponse = await fetch(`${BASE_URL}/api/teams/invitations/${memberId2}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${leaderToken}`,
      },
      body: JSON.stringify({ accept: false }),
    });

    const rejectData = await rejectResponse.json();

    if (!rejectData.success) {
      console.error('❌ Reject failed:', rejectData.message);
      process.exit(1);
    }

    console.log(`✅ Reject successful`);

    const verifyReject = await sql`
      SELECT * FROM team_members WHERE id = ${memberId2} LIMIT 1
    `;

    if (verifyReject[0].invitation_status !== 'REJECTED') {
      console.error(`❌ Expected REJECTED, got ${verifyReject[0].invitation_status}`);
      process.exit(1);
    }

    console.log(`✅ Reject verified: status = REJECTED`);

    // 6. Test Case 3: Non-leader cannot respond
    console.log('\n📋 STEP 6: Testing unauthorized access...\n');

    // Login as a different user (not leader, not invitee)
    const otherUsersResult = await sql`
      SELECT u.id, u.email FROM users u
      WHERE u.role = 'MAHASISWA'
      AND u.id != ${testTeam.leader_id}
      AND u.id != ${testUser.id}
      LIMIT 1
    `;

    if (otherUsersResult.length === 0) {
      console.log(`⚠️  Skipping unauthorized test - no other user available`);
    } else {
      const otherUser = otherUsersResult[0];
      
      const otherLoginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: otherUser.email,
          password: 'password123',
        }),
      });

      const otherLoginData = await otherLoginResponse.json();

      if (otherLoginData.success) {
        const otherToken = otherLoginData.data.token;

        const unauthorizedResponse = await fetch(`${BASE_URL}/api/teams/invitations/${memberId2}/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${otherToken}`,
          },
          body: JSON.stringify({ accept: true }),
        });

        const unauthorizedData = await unauthorizedResponse.json();

        if (unauthorizedData.success) {
          console.error(`❌ Unauthorized user was allowed to respond!`);
          process.exit(1);
        }

        console.log(`✅ Unauthorized access prevented`);
        console.log(`   Status: ${unauthorizedResponse.status}`);
        console.log(`   Message: ${unauthorizedData.message}`);
      }
    }

    // 7. Cleanup
    console.log('\n📋 STEP 7: Cleaning up test data...\n');

    await sql`DELETE FROM team_members WHERE id IN (${memberId}, ${memberId2})`;
    console.log(`✅ Test records deleted`);

    console.log('\n' + '═'.repeat(70));
    console.log('\n🎉 ALL TESTS PASSED!\n');
    console.log('✅ Leader can accept join requests');
    console.log('✅ Leader can reject join requests');
    console.log('✅ Non-leader cannot respond to join requests');
    console.log('\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.log('\n' + '═'.repeat(70) + '\n');
    process.exit(1);
  }
}

testLeaderAcceptsJoinRequest();
