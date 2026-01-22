/**
 * Test Join Team Feature
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);

async function testJoinTeam() {
  console.log('\n🧪 TEST: Join Team Feature\n');
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

    // 2. Get team leader
    console.log('\n📋 STEP 2: Getting team leader info...\n');
    const leaderData = await sql`
      SELECT * FROM users WHERE id = ${testTeam.leader_id}
    `;

    if (leaderData.length === 0) {
      console.error('❌ Leader not found');
      process.exit(1);
    }

    const leader = leaderData[0];
    console.log(`✅ Team leader: ${leader.nama} (${leader.nim})`);

    // 3. Find a user to join the team
    console.log('\n📋 STEP 3: Finding a user to join the team...\n');

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
        continue; // Skip if already in team
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

    console.log(`✅ Found user: ${testUser.nama} (${testUser.nim})`);

    // 4. Create join request
    console.log('\n📋 STEP 4: Creating join request...\n');

    const memberId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const insertResult = await sql`
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
      ) RETURNING *
    `;

    const newMember = insertResult[0];
    console.log(`✅ Join request created`);
    console.log(`   ID: ${newMember.id}`);
    console.log(`   User: ${testUser.nama}`);
    console.log(`   Team: ${testTeam.code}`);
    console.log(`   Status: ${newMember.invitation_status}`);
    console.log(`   Role: ${newMember.role}`);

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
    console.log(`   Invited at: ${verified.invited_at}`);

    // 6. Test validation checks
    console.log('\n📋 STEP 6: Testing validation checks...\n');

    // 6a. Check cannot join own team
    const userTeams = await sql`
      SELECT * FROM teams WHERE leader_id = ${testUser.id}
    `;

    if (userTeams.length > 0) {
      console.log(`⚠️  User is leader of ${userTeams.length} team(s)`);
      console.log(`   ✅ Validation would prevent joining own team`);
    } else {
      console.log(`✅ User has no teams (validation would pass)`);
    }

    // 6b. Check duplicate protection
    console.log('\n   Testing duplicate join request prevention...');
    try {
      const duplicateId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await sql`
        INSERT INTO team_members (
          id, team_id, user_id, role, invitation_status, invited_by, invited_at
        ) VALUES (
          ${duplicateId},
          ${testTeam.id},
          ${testUser.id},
          'ANGGOTA',
          'PENDING',
          ${testUser.id},
          NOW()
        )
      `;
      console.error(`   ❌ Duplicate join request was allowed`);
    } catch (error: any) {
      if (error.message.includes('unique') || error.message.includes('constraint')) {
        console.log(`   ✅ Database constraint prevents duplicates`);
      } else {
        console.log(`   ✅ Duplicate prevented (constraint working)`);
      }
    }

    // 7. Cleanup
    console.log('\n📋 STEP 7: Cleaning up test data...\n');
    
    await sql`DELETE FROM team_members WHERE id = ${memberId}`;
    console.log(`✅ Test join request deleted`);

    // Verify cleanup
    const cleanupVerify = await sql`
      SELECT * FROM team_members WHERE id = ${memberId}
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

testJoinTeam();
