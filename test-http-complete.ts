/**
 * Test HTTP Endpoint - Automatic with Database Verification
 * Tidak perlu manual token input
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);
const BASE_URL = process.env.WORKER_URL || 'http://localhost:8787';

interface HTTPTestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  message: string;
  details?: any;
}

const testResults: HTTPTestResult[] = [];

async function testHTTP() {
  console.log('\n🧪 HTTP ENDPOINT TEST - Leave Team\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('═'.repeat(70));

  try {
    // ========== SETUP: Get test data ==========
    console.log('\n📋 SETUP: Getting test data from database...\n');

    // Get a user who is ANGGOTA
    const anggotaResult = await sql`
      SELECT DISTINCT 
        tm.id as member_id,
        tm.user_id,
        tm.team_id,
        u.email,
        t.code as team_code
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      JOIN teams t ON tm.team_id = t.id
      WHERE tm.role = 'ANGGOTA' AND tm.invitation_status = 'ACCEPTED'
      LIMIT 1
    `;

    if (anggotaResult.length === 0) {
      console.error('❌ No ANGGOTA member found in database');
      process.exit(1);
    }

    const testData = anggotaResult[0];
    const testUserId = testData.user_id;
    const testTeamId = testData.team_id;
    const testEmail = testData.email;
    const teamCode = testData.team_code;

    console.log(`✅ Found ANGGOTA: ${testEmail}`);
    console.log(`✅ Team: ${teamCode}`);
    console.log(`✅ User ID: ${testUserId}`);

    // Get user password (or create test user)
    const userResult = await sql`
      SELECT password FROM users WHERE id = ${testUserId}
    `;

    if (userResult.length === 0) {
      console.error('❌ User not found');
      process.exit(1);
    }

    // ========== TEST 1: Login ==========
    console.log('\n📊 TEST 1: Login to get token...');

    let token: string | null = null;

    try {
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: userResult[0].password,
        }),
      });

      if (!loginRes.ok) {
        throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
      }

      const loginData = await loginRes.json();
      token = loginData.data?.token;

      if (!token) {
        throw new Error('No token in login response');
      }

      console.log(`✅ Login successful`);
      console.log(`✅ Token: ${token.substring(0, 20)}...`);
      testResults.push({ name: 'Login', status: 'PASS', message: 'Successfully obtained auth token' });
    } catch (error: any) {
      console.error(`❌ Login failed: ${error.message}`);
      testResults.push({ name: 'Login', status: 'FAIL', message: error.message });
      process.exit(1);
    }

    // ========== TEST 2: Get My Teams BEFORE Leave ==========
    console.log('\n📊 TEST 2: GET /teams/my-teams (BEFORE leave)...');

    let teamFoundBefore = false;

    try {
      const getRes = await fetch(`${BASE_URL}/api/teams/my-teams`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!getRes.ok) {
        throw new Error(`GET failed: ${getRes.status}`);
      }

      const getData = await getRes.json();
      const teams = getData.data || [];
      const myTeam = teams.find((t: any) => t.id === testTeamId);

      if (myTeam) {
        teamFoundBefore = true;
        console.log(`✅ Team found: ${myTeam.code}`);
        console.log(`✅ Members: ${myTeam.members.length}`);
        console.log(`✅ isLeader: ${myTeam.isLeader}`);
        testResults.push({
          name: 'GET /teams/my-teams BEFORE',
          status: 'PASS',
          message: `Team found with ${myTeam.members.length} members`,
        });
      } else {
        console.warn(`⚠️ Team not found in response`);
        testResults.push({
          name: 'GET /teams/my-teams BEFORE',
          status: 'FAIL',
          message: 'Team not found in response',
          details: { teams: teams.map((t: any) => t.code) },
        });
      }
    } catch (error: any) {
      console.error(`❌ GET failed: ${error.message}`);
      testResults.push({
        name: 'GET /teams/my-teams BEFORE',
        status: 'ERROR',
        message: error.message,
      });
    }

    // ========== TEST 3: Leave Team ==========
    console.log('\n📊 TEST 3: POST /teams/:teamId/leave...');

    try {
      const leaveRes = await fetch(`${BASE_URL}/api/teams/${testTeamId}/leave`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const leaveData = await leaveRes.json();

      if (!leaveRes.ok) {
        throw new Error(`Leave failed: ${leaveRes.status} - ${leaveData.message}`);
      }

      console.log(`✅ Leave endpoint returned 200`);
      console.log(`✅ Response: ${leaveData.message}`);
      testResults.push({
        name: 'POST /teams/:teamId/leave',
        status: 'PASS',
        message: leaveData.message,
      });
    } catch (error: any) {
      console.error(`❌ Leave failed: ${error.message}`);
      testResults.push({
        name: 'POST /teams/:teamId/leave',
        status: 'FAIL',
        message: error.message,
      });
      process.exit(1);
    }

    // ========== TEST 4: Verify in Database ==========
    console.log('\n📊 TEST 4: Verify deletion in database...');

    try {
      const verify = await sql`
        SELECT id FROM team_members
        WHERE team_id = ${testTeamId} AND user_id = ${testUserId}
      `;

      if (verify.length === 0) {
        console.log(`✅ Member confirmed deleted from database`);
        testResults.push({
          name: 'Database verification',
          status: 'PASS',
          message: 'Member record deleted',
        });
      } else {
        console.error(`❌ Member still exists in database!`);
        testResults.push({
          name: 'Database verification',
          status: 'FAIL',
          message: 'Member record still exists',
          details: verify,
        });
      }
    } catch (error: any) {
      console.error(`❌ Database check failed: ${error.message}`);
      testResults.push({
        name: 'Database verification',
        status: 'ERROR',
        message: error.message,
      });
    }

    // ========== TEST 5: Get My Teams AFTER Leave ==========
    console.log('\n📊 TEST 5: GET /teams/my-teams (AFTER leave)...');

    let teamFoundAfter = false;

    try {
      const getRes = await fetch(`${BASE_URL}/api/teams/my-teams`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!getRes.ok) {
        throw new Error(`GET failed: ${getRes.status}`);
      }

      const getData = await getRes.json();
      const teams = getData.data || [];
      const myTeam = teams.find((t: any) => t.id === testTeamId);

      if (!myTeam) {
        console.log(`✅ Team NOT found (as expected)`);
        console.log(`✅ Total teams: ${teams.length}`);
        testResults.push({
          name: 'GET /teams/my-teams AFTER',
          status: 'PASS',
          message: 'Team successfully removed from list',
          details: { teamsRemaining: teams.length },
        });
      } else {
        console.error(`❌ Team still found in list!`);
        console.log(`❌ Members: ${myTeam.members.length}`);
        testResults.push({
          name: 'GET /teams/my-teams AFTER',
          status: 'FAIL',
          message: 'Team still in list after leave',
          details: { members: myTeam.members.length },
        });
        teamFoundAfter = true;
      }
    } catch (error: any) {
      console.error(`❌ GET failed: ${error.message}`);
      testResults.push({
        name: 'GET /teams/my-teams AFTER',
        status: 'ERROR',
        message: error.message,
      });
    }

    // ========== SUMMARY ==========
    console.log('\n' + '═'.repeat(70));
    console.log('\n📋 DETAILED RESULTS:\n');

    let passed = 0;
    let failed = 0;
    let errors = 0;

    for (const result of testResults) {
      const icon =
        result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${icon} ${result.name}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Message: ${result.message}`);
      if (result.details) {
        console.log(`   Details: ${JSON.stringify(result.details)}`);
      }
      console.log();

      if (result.status === 'PASS') passed++;
      else if (result.status === 'FAIL') failed++;
      else errors++;
    }

    console.log('═'.repeat(70));
    console.log(`\n📊 SUMMARY: ${passed} passed, ${failed} failed, ${errors} errors`);

    if (failed === 0 && errors === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Leave team functionality working correctly!\n');
      process.exit(0);
    } else {
      console.log('\n⚠️ SOME TESTS FAILED - See details above\n');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

testHTTP();
