/**
 * Test HTTP Endpoint - Remove Member (Ketua removes Anggota)
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);
const BASE_URL = process.env.WORKER_URL || 'http://localhost:8787';

async function testRemoveMember() {
  console.log('\n🧪 HTTP ENDPOINT TEST - Remove Member (Ketua removes Anggota)\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('═'.repeat(70));

  try {
    // 1. Use the test team we just created
    console.log('\n📋 STEP 1: Getting test data...\n');

    // Get the test team we created
    const teamData = await sql`
      SELECT 
        t.id,
        t.code,
        t.leader_id
      FROM teams t
      WHERE t.code LIKE 'TEAM-%TEST'
      ORDER BY t.id DESC
      LIMIT 1
    `;

    if (teamData.length === 0) {
      console.error('❌ No test team found. Run: npx tsx setup-test-data.ts');
      process.exit(1);
    }

    const team = teamData[0];
    const teamId = team.id;
    const leaderId = team.leader_id;
    const teamCode = team.code;

    console.log(`✅ Found team: ${teamCode}`);

    // Get KETUA user
    const ketua = await sql`
      SELECT u.id, u.email FROM users u WHERE u.id = ${leaderId}
    `;

    const ketuaEmail = ketua[0].email;
    const ketuaPassword = 'password123'; // Default seed password

    console.log(`✅ KETUA: ${ketuaEmail}`);

    // Get ANGGOTA member
    const anggota = await sql`
      SELECT 
        tm.id as member_id,
        u.id as user_id,
        u.email
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ${teamId} 
        AND tm.role = 'ANGGOTA'
      LIMIT 1
    `;

    if (anggota.length === 0) {
      console.error('❌ ANGGOTA not found in test team');
      process.exit(1);
    }

    const anggotaMemberId = anggota[0].member_id;
    const anggotaEmail = anggota[0].email;

    console.log(`✅ ANGGOTA: ${anggotaEmail}`);

    // 2. KETUA login
    console.log('\n📊 STEP 2: KETUA login...\n');

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ketuaEmail,
        password: ketuaPassword,
      }),
    });

    if (!loginRes.ok) {
      console.error(`❌ Login failed: ${loginRes.status}`);
      process.exit(1);
    }

    const loginJson = await loginRes.json();
    const token = loginJson.data?.token;

    if (!token) {
      console.error('❌ No token');
      process.exit(1);
    }

    console.log(`✅ KETUA login successful`);

    // 3. Get team members BEFORE remove
    console.log('\n📊 STEP 3: GET /teams/:teamId/members (BEFORE remove)...\n');

    const beforeRes = await fetch(`${BASE_URL}/api/teams/${teamId}/members`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const beforeData = await beforeRes.json();
    const membersBefore = beforeData.data || [];

    console.log(`✅ Total members: ${membersBefore.length}`);

    const anggotaBefore = membersBefore.find(
      (m: any) => m.id === anggota[0].user_id
    );

    if (anggotaBefore) {
      console.log(`✅ ANGGOTA in list: ${anggotaBefore.nama} (${anggotaBefore.email})`);
    }

    // 4. Remove member
    console.log(`\n📊 STEP 4: POST /teams/:teamId/members/:memberId/remove...\n`);

    const removeRes = await fetch(
      `${BASE_URL}/api/teams/${teamId}/members/${anggotaMemberId}/remove`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const removeJson = await removeRes.json();

    if (!removeRes.ok) {
      console.error(`❌ Remove failed: ${removeRes.status}`);
      console.error('Response:', removeJson);
      process.exit(1);
    }

    console.log(`✅ Remove endpoint returned 200`);
    console.log(`✅ Message: ${removeJson.message}`);

    // 5. Database verification
    console.log('\n📊 STEP 5: Database verification...\n');

    const verify = await sql`
      SELECT id FROM team_members
      WHERE id = ${anggotaMemberId}
    `;

    if (verify.length === 0) {
      console.log(`✅ Member deleted from database`);
    } else {
      console.error(`❌ Member still in database!`);
      process.exit(1);
    }

    // 6. Check team members AFTER remove
    console.log('\n📊 STEP 6: GET /teams/:teamId/members (AFTER remove)...\n');

    const afterRes = await fetch(`${BASE_URL}/api/teams/${teamId}/members`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const afterData = await afterRes.json();
    const membersAfter = afterData.data || [];

    console.log(`✅ Total members now: ${membersAfter.length}`);

    const anggotaAfter = membersAfter.find(
      (m: any) => m.id === anggota[0].user_id
    );

    if (!anggotaAfter) {
      console.log(`✅ ANGGOTA removed from members list`);
    } else {
      console.error(`❌ ANGGOTA still in list!`);
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

testRemoveMember();
