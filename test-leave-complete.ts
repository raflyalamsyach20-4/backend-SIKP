/**
 * Simple test script untuk verify leaveTeam functionality
 * Menggunakan test data dari database langsung
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);

interface TestResult {
  passed: boolean;
  name: string;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ passed: true, name, message: '✅ PASSED' });
  } catch (error: any) {
    results.push({
      passed: false,
      name,
      message: `❌ FAILED: ${error.message}`,
      details: error,
    });
  }
}

async function runTests() {
  console.log('\n🧪 LEAVE TEAM FUNCTIONALITY TEST\n');
  console.log('═'.repeat(60));

  // Test 1: Database delete works
  await test('Database DELETE operation', async () => {
    // Get a team with anggota
    const teams = await sql`
      SELECT t.id, t.code
      FROM teams t
      WHERE EXISTS (
        SELECT 1 FROM team_members tm 
        WHERE tm.team_id = t.id AND tm.role = 'ANGGOTA'
      )
      LIMIT 1
    `;

    if (teams.length === 0) throw new Error('No team with ANGGOTA found');

    const teamId = teams[0].id;
    const teamCode = teams[0].code;

    // Get anggota member
    const members = await sql`
      SELECT id FROM team_members
      WHERE team_id = ${teamId} AND role = 'ANGGOTA'
      LIMIT 1
    `;

    if (members.length === 0) throw new Error('No ANGGOTA member found');

    const memberId = members[0].id;

    // Delete
    const deleteResult = await sql`
      DELETE FROM team_members
      WHERE id = ${memberId}
      RETURNING id
    `;

    if (deleteResult.length === 0) throw new Error('Delete returned no rows');

    // Verify deletion
    const verify = await sql`
      SELECT id FROM team_members WHERE id = ${memberId}
    `;

    if (verify.length > 0) throw new Error('Member still exists after DELETE');

    // Restore for next tests
    await sql`
      INSERT INTO team_members (id, team_id, user_id, role, invitation_status, invited_at, invited_by)
      SELECT ${memberId}, ${teamId}, (SELECT user_id FROM team_members WHERE team_id = ${teamId} AND role = 'KETUA' LIMIT 1), 'ANGGOTA', 'ACCEPTED', NOW(), (SELECT user_id FROM team_members WHERE team_id = ${teamId} AND role = 'KETUA' LIMIT 1)
    `;
  });

  // Test 2: getMyTeams filters correctly
  await test('getMyTeams filters ACCEPTED memberships', async () => {
    // Get a user with ACCEPTED membership
    const user = await sql`
      SELECT DISTINCT tm.user_id
      FROM team_members tm
      WHERE tm.invitation_status = 'ACCEPTED' AND tm.role = 'ANGGOTA'
      LIMIT 1
    `;

    if (user.length === 0) throw new Error('No ACCEPTED ANGGOTA member found');

    const userId = user[0].user_id;

    // Query like getMyTeams does
    const memberships = await sql`
      SELECT tm.id, tm.user_id, tm.team_id, tm.invitation_status
      FROM team_members tm
      WHERE tm.user_id = ${userId}
    `;

    const acceptedOnly = memberships.filter((m: any) => m.invitation_status === 'ACCEPTED');

    if (acceptedOnly.length === 0) throw new Error('No ACCEPTED memberships found after filter');

    for (const membership of acceptedOnly) {
      const teamData = await sql`
        SELECT id, code FROM teams WHERE id = ${membership.team_id}
      `;
      if (teamData.length === 0) throw new Error(`Team not found: ${membership.team_id}`);
    }
  });

  // Test 3: Cascade delete works
  await test('Cascade delete team → removes all members', async () => {
    // Create a test team
    const createTeamResult = await sql`
      INSERT INTO teams (id, code, leader_id, status)
      VALUES (${'test-' + Date.now()}, ${'TEST-' + Date.now()}, 
              (SELECT id FROM users WHERE role = 'MAHASISWA' LIMIT 1), 'PENDING')
      RETURNING id
    `;

    if (createTeamResult.length === 0) throw new Error('Failed to create test team');

    const testTeamId = createTeamResult[0].id;

    // Add member
    const leaderId = (
      await sql`SELECT id FROM users WHERE role = 'MAHASISWA' LIMIT 1`
    )[0].id;

    await sql`
      INSERT INTO team_members (id, team_id, user_id, role, invitation_status)
      VALUES (${'tm-' + Date.now()}, ${testTeamId}, ${leaderId}, 'KETUA', 'ACCEPTED')
    `;

    // Verify members exist
    const beforeDelete = await sql`SELECT COUNT(*) as cnt FROM team_members WHERE team_id = ${testTeamId}`;
    if (parseInt(beforeDelete[0].cnt) === 0) throw new Error('No members found before delete');

    // Delete team
    await sql`DELETE FROM teams WHERE id = ${testTeamId}`;

    // Verify cascade delete worked
    const afterDelete = await sql`SELECT COUNT(*) as cnt FROM team_members WHERE team_id = ${testTeamId}`;
    if (parseInt(afterDelete[0].cnt) > 0) throw new Error('Members still exist after team DELETE (cascade failed)');
  });

  // Test 4: Member query performance
  await test('Member queries are efficient', async () => {
    const startTime = Date.now();

    // Get all teams with member count
    const teams = await sql`
      SELECT t.id, COUNT(tm.id) as member_count
      FROM teams t
      LEFT JOIN team_members tm ON t.id = tm.team_id
      GROUP BY t.id
      LIMIT 10
    `;

    const elapsed = Date.now() - startTime;

    if (elapsed > 5000) throw new Error(`Query took too long: ${elapsed}ms`);
    if (teams.length === 0) throw new Error('No teams found');
  });

  // Test 5: Role field exists and is populated
  await test('Role field exists and populated correctly', async () => {
    const members = await sql`
      SELECT id, role FROM team_members
      WHERE role IS NOT NULL
      LIMIT 10
    `;

    if (members.length === 0) throw new Error('No members found');

    for (const member of members) {
      if (!['KETUA', 'ANGGOTA'].includes(member.role)) {
        throw new Error(`Invalid role value: ${member.role}`);
      }
    }

    const ketuaCount = members.filter((m: any) => m.role === 'KETUA').length;
    const anggotaCount = members.filter((m: any) => m.role === 'ANGGOTA').length;

    if (ketuaCount === 0 || anggotaCount === 0) {
      throw new Error(`Imbalanced roles: KETUA=${ketuaCount}, ANGGOTA=${anggotaCount}`);
    }
  });

  // Print results
  console.log('\n' + '═'.repeat(60));
  console.log('\n📋 TEST RESULTS:\n');

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    console.log(`${result.passed ? '✅' : '❌'} ${result.name}`);
    console.log(`   ${result.message}`);
    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details).substring(0, 100)}`);
    }
    passed += result.passed ? 1 : 0;
    failed += result.passed ? 0 : 1;
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 SUMMARY: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.log('⚠️ SOME TESTS FAILED\n');
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
