import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);

async function testLeaveTeam() {
  console.log('\n🧪 TEST: Simulating Leave Team Process\n');
  
  try {
    // 1. Get a team with anggota
    const team = await sql`
      SELECT t.id, t.code, t.leader_id
      FROM teams t
      WHERE EXISTS (
        SELECT 1 FROM team_members tm 
        WHERE tm.team_id = t.id AND tm.role = 'ANGGOTA'
      )
      LIMIT 1
    `;
    
    if (team.length === 0) {
      console.log('❌ No team with ANGGOTA found');
      process.exit(0);
    }
    
    const teamId = team[0].id;
    console.log(`✅ Found team: ${team[0].code}`);
    
    // 2. Get an anggota member
    const anggota = await sql`
      SELECT id, user_id, role
      FROM team_members
      WHERE team_id = ${teamId} AND role = 'ANGGOTA'
      LIMIT 1
    `;
    
    if (anggota.length === 0) {
      console.log('❌ No ANGGOTA found in team');
      process.exit(0);
    }
    
    const memberId = anggota[0].id;
    const userId = anggota[0].user_id;
    console.log(`✅ Found ANGGOTA member: ${memberId}`);
    
    // 3. Check before delete
    console.log('\n📊 BEFORE DELETE:');
    const beforeDelete = await sql`
      SELECT id, user_id, role, invitation_status
      FROM team_members
      WHERE team_id = ${teamId}
    `;
    console.table(beforeDelete);
    
    // 4. Simulate delete
    console.log('\n🗑️ DELETING member...');
    const deleteResult = await sql`
      DELETE FROM team_members
      WHERE id = ${memberId}
      RETURNING id, user_id, role
    `;
    console.log('✅ Delete returned:', deleteResult);
    
    // 5. Check after delete
    console.log('\n📊 AFTER DELETE:');
    const afterDelete = await sql`
      SELECT id, user_id, role, invitation_status
      FROM team_members
      WHERE team_id = ${teamId}
    `;
    console.table(afterDelete);
    
    // 6. Verify it's gone
    const verifyDelete = await sql`
      SELECT id FROM team_members WHERE id = ${memberId}
    `;
    
    if (verifyDelete.length === 0) {
      console.log('\n✅ SUCCESS: Member permanently deleted!');
    } else {
      console.log('\n❌ FAILURE: Member still exists!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

testLeaveTeam();
