/**
 * Test Cancel Invitation Endpoint
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);
const BASE_URL = process.env.WORKER_URL || 'http://localhost:8787';

async function testCancelInvitation() {
  console.log('\n🧪 TEST: Cancel Invitation Endpoint\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('═'.repeat(70));

  try {
    // 1. Get a KETUA user
    console.log('\n📋 STEP 1: Getting KETUA user...\n');

    const ketua = await sql`
      SELECT u.id, u.email, t.id as team_id
      FROM users u
      JOIN teams t ON u.id = t.leader_id
      LIMIT 1
    `;

    if (ketua.length === 0) {
      console.error('❌ No KETUA found');
      process.exit(1);
    }

    const ketuaUserId = ketua[0].id;
    const ketuaEmail = ketua[0].email;

    console.log(`✅ Found KETUA: ${ketuaEmail}`);

    // 2. Get a PENDING invitation
    console.log('\n📋 STEP 2: Finding PENDING invitation...\n');

    const pendingInvitation = await sql`
      SELECT 
        tm.id as member_id,
        tm.user_id,
        tm.team_id,
        u.email as invited_email,
        t.code as team_code
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      JOIN teams t ON tm.team_id = t.id
      WHERE tm.invitation_status = 'PENDING' 
        AND t.leader_id = ${ketuaUserId}
      LIMIT 1
    `;

    if (pendingInvitation.length === 0) {
      console.error('❌ No PENDING invitation found. Creating test invitation...');
      
      // Create test invitation
      const anggota = await sql`
        SELECT id, email FROM users WHERE role = 'MAHASISWA' AND id != ${ketuaUserId} LIMIT 1
      `;

      if (anggota.length === 0) {
        console.error('❌ No other mahasiswa found');
        process.exit(1);
      }

      const invitationId = Math.random().toString(36).substring(7);
      await sql`
        INSERT INTO team_members (id, team_id, user_id, role, invitation_status, invited_by)
        VALUES (${invitationId}, ${ketua[0].team_id}, ${anggota[0].id}, 'ANGGOTA', 'PENDING', ${ketuaUserId})
      `;

      console.log(`✅ Created test invitation: ${invitationId}`);
    }

    const invitation = pendingInvitation[0] || (await sql`
      SELECT 
        tm.id as member_id,
        tm.user_id,
        tm.team_id,
        u.email as invited_email,
        t.code as team_code
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      JOIN teams t ON tm.team_id = t.id
      WHERE tm.invitation_status = 'PENDING' 
        AND t.leader_id = ${ketuaUserId}
      LIMIT 1
    `)[0];

    if (!invitation) {
      console.error('❌ Failed to create test invitation');
      process.exit(1);
    }

    console.log(`✅ Found PENDING invitation:`);
    console.log(`   ID: ${invitation.member_id}`);
    console.log(`   Invited: ${invitation.invited_email}`);
    console.log(`   Team: ${invitation.team_code}`);

    // 3. Login as KETUA
    console.log('\n📋 STEP 3: Login as KETUA...\n');

    let token: string | null = null;
    let ketuaPassword = 'password123';
    if (ketuaEmail === 'budi.santoso@student.univ.ac.id') ketuaPassword = 'password123';
    if (ketuaEmail === 'rafly@gmail.com') ketuaPassword = 'rafly123';

    try {
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: ketuaEmail,
          password: ketuaPassword,
        }),
      });

      const loginData = await loginRes.json();

      if (!loginRes.ok) {
        throw new Error(`Login failed: ${loginData.message}`);
      }

      token = loginData.data?.token;
      if (!token) throw new Error('No token received');

      console.log(`✅ Login successful`);
      console.log(`✅ Token: ${token.substring(0, 20)}...`);
    } catch (error: any) {
      console.error(`❌ Login failed: ${error.message}`);
      process.exit(1);
    }

    // 4. Call cancel invitation endpoint
    console.log('\n📋 STEP 4: Call POST /invitations/:memberId/cancel...\n');

    try {
      const cancelRes = await fetch(
        `${BASE_URL}/api/teams/invitations/${invitation.member_id}/cancel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const cancelData = await cancelRes.json();

      if (!cancelRes.ok) {
        throw new Error(`Cancel failed: ${cancelRes.status} - ${cancelData.message}`);
      }

      console.log(`✅ Cancel endpoint returned 200`);
      console.log(`✅ Message: ${cancelData.message}`);
      console.log(`✅ Cancelled ID: ${cancelData.data.cancelledInvitationId}`);
    } catch (error: any) {
      console.error(`❌ Cancel failed: ${error.message}`);
      process.exit(1);
    }

    // 5. Verify in database
    console.log('\n📋 STEP 5: Verify deletion in database...\n');

    try {
      const verify = await sql`
        SELECT id FROM team_members
        WHERE id = ${invitation.member_id}
      `;

      if (verify.length === 0) {
        console.log(`✅ Invitation confirmed deleted from database`);
      } else {
        console.error(`❌ Invitation still exists in database!`);
        process.exit(1);
      }
    } catch (error: any) {
      console.error(`❌ Database check failed: ${error.message}`);
      process.exit(1);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('\n🎉 ALL TESTS PASSED!\n');
  } catch (error: any) {
    console.error('\n💥 Error:', error.message);
    process.exit(1);
  }
}

testCancelInvitation();
