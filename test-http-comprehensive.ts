/**
 * COMPREHENSIVE HTTP ENDPOINT TEST SUITE
 * Tests all leave/remove member functionality
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);
const BASE_URL = process.env.WORKER_URL || 'http://localhost:8787';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true, message: 'PASSED' });
    console.log(`✅ ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, message: error.message });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

async function main() {
  console.log('\n🧪 COMPREHENSIVE HTTP ENDPOINT TEST SUITE\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('═'.repeat(70));

  // TEST 1: Leave Team (ANGGOTA leaves)
  console.log('\n📋 TEST GROUP 1: Leave Team Functionality\n');

  await runTest('T1.1: Find ANGGOTA member', async () => {
    const anggota = await sql`
      SELECT id, team_id FROM team_members 
      WHERE role = 'ANGGOTA' AND invitation_status = 'ACCEPTED'
      AND team_id NOT IN (SELECT team_id FROM teams WHERE id IN (
        SELECT team_id FROM team_members WHERE id IS NOT NULL
        GROUP BY team_id HAVING COUNT(*) < 2
      ))
      LIMIT 1
    `;
    if (anggota.length === 0) throw new Error('No ANGGOTA found');
  });

  await runTest('T1.2: ANGGOTA login', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hikmah@gmail.com',
        password: 'hikmah123',
      }),
    });
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
    const data = await loginRes.json();
    if (!data.data?.token) throw new Error('No token in response');
  });

  await runTest('T1.3: GET /teams/my-teams shows user\'s teams', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hikmah@gmail.com',
        password: 'hikmah123',
      }),
    });
    const loginData = await loginRes.json();
    const token = loginData.data.token;

    const teamsRes = await fetch(`${BASE_URL}/api/teams/my-teams`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!teamsRes.ok) throw new Error(`GET failed: ${teamsRes.status}`);
    const data = await teamsRes.json();
    if (!Array.isArray(data.data)) throw new Error('Response not an array');
  });

  await runTest('T1.4: ANGGOTA can leave team', async () => {
    const anggota = await sql`
      SELECT tm.id, tm.team_id, u.email
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.role = 'ANGGOTA' AND tm.invitation_status = 'ACCEPTED'
      AND u.email = 'hikmah@gmail.com'
      LIMIT 1
    `;

    if (anggota.length === 0) throw new Error('Test user not ANGGOTA');

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hikmah@gmail.com',
        password: 'hikmah123',
      }),
    });
    const loginData = await loginRes.json();
    const token = loginData.data.token;

    const leaveRes = await fetch(
      `${BASE_URL}/api/teams/${anggota[0].team_id}/leave`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!leaveRes.ok) throw new Error(`Leave failed: ${leaveRes.status}`);

    // Verify deletion
    const verify = await sql`
      SELECT id FROM team_members WHERE id = ${anggota[0].id}
    `;
    if (verify.length > 0) throw new Error('Member still in database');
  });

  // TEST 2: Remove Member (KETUA removes ANGGOTA)
  console.log('\n📋 TEST GROUP 2: Remove Member Functionality\n');

  await runTest('T2.1: Setup test team', async () => {
    // Check if test team exists
    const testTeam = await sql`
      SELECT id FROM teams WHERE code LIKE 'TEAM-%TEST' LIMIT 1
    `;
    if (testTeam.length === 0) throw new Error('No test team. Run: npx tsx setup-test-data.ts');
  });

  await runTest('T2.2: KETUA can remove ANGGOTA', async () => {
    const testTeam = await sql`
      SELECT id, leader_id FROM teams WHERE code LIKE 'TEAM-%TEST' LIMIT 1
    `;
    if (testTeam.length === 0) throw new Error('No test team');

    const anggota = await sql`
      SELECT tm.id as member_id, u.email
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ${testTeam[0].id} AND tm.role = 'ANGGOTA'
      LIMIT 1
    `;
    if (anggota.length === 0) throw new Error('No ANGGOTA in test team');

    const ketua = await sql`
      SELECT u.email FROM users WHERE id = ${testTeam[0].leader_id}
    `;

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ketua[0].email,
        password: 'password123',
      }),
    });
    if (!loginRes.ok) throw new Error(`KETUA login failed: ${loginRes.status}`);

    const loginData = await loginRes.json();
    const token = loginData.data.token;

    const removeRes = await fetch(
      `${BASE_URL}/api/teams/${testTeam[0].id}/members/${anggota[0].member_id}/remove`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!removeRes.ok) throw new Error(`Remove failed: ${removeRes.status}`);

    // Verify deletion
    const verify = await sql`
      SELECT id FROM team_members WHERE id = ${anggota[0].member_id}
    `;
    if (verify.length > 0) throw new Error('Member still in database');
  });

  await runTest('T2.3: KETUA cannot remove themselves', async () => {
    const testTeam = await sql`
      SELECT id, leader_id FROM teams WHERE code LIKE 'TEAM-%TEST' LIMIT 1
    `;

    const ketuaMember = await sql`
      SELECT tm.id FROM team_members 
      WHERE team_id = ${testTeam[0].id} AND user_id = ${testTeam[0].leader_id}
    `;

    if (ketuaMember.length === 0) throw new Error('KETUA not member');

    const ketua = await sql`
      SELECT u.email FROM users WHERE id = ${testTeam[0].leader_id}
    `;

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ketua[0].email,
        password: 'password123',
      }),
    });
    const loginData = await loginRes.json();
    const token = loginData.data.token;

    const removeRes = await fetch(
      `${BASE_URL}/api/teams/${testTeam[0].id}/members/${ketuaMember[0].id}/remove`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (removeRes.ok) throw new Error('Should not allow removing KETUA');
  });

  // TEST 3: Response Format
  console.log('\n📋 TEST GROUP 3: Response Format\n');

  await runTest('T3.1: getMyTeams includes isLeader flag', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'budi.santoso@student.univ.ac.id',
        password: 'password123',
      }),
    });
    const loginData = await loginRes.json();
    const token = loginData.data.token;

    const teamsRes = await fetch(`${BASE_URL}/api/teams/my-teams`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await teamsRes.json();

    if (!Array.isArray(data.data)) throw new Error('Not array');
    if (data.data.length > 0) {
      const team = data.data[0];
      if (typeof team.isLeader !== 'boolean') {
        throw new Error('isLeader not boolean');
      }
    }
  });

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('\n📊 TEST SUMMARY:\n');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`\n📈 Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! HTTP endpoints working correctly!\n');
    process.exit(0);
  } else {
    console.log('⚠️ SOME TESTS FAILED\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
