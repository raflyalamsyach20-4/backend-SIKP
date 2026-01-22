import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);

async function findTeamWithBothRoles() {
  console.log('🔍 Finding teams with KETUA and ANGGOTA...\n');

  const teams = await sql`
    SELECT 
      t.id,
      t.code,
      t.leader_id,
      COUNT(DISTINCT tm.id) as total_members
    FROM teams t
    LEFT JOIN team_members tm ON t.id = tm.team_id AND tm.invitation_status = 'ACCEPTED'
    GROUP BY t.id, t.code, t.leader_id
    HAVING COUNT(DISTINCT tm.id) >= 2
  `;

  console.log(`Found ${teams.length} teams with 2+ members:\n`);

  for (const team of teams) {
    console.log(`📌 Team: ${team.code}`);
    console.log(`   ID: ${team.id}`);
    console.log(`   Leader: ${team.leader_id}`);
    console.log(`   Members: ${team.total_members}`);

    // Get members
    const members = await sql`
      SELECT 
        tm.id,
        tm.user_id,
        u.email,
        tm.role
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ${team.id} AND tm.invitation_status = 'ACCEPTED'
    `;

    console.log(`   Members:`);
    for (const member of members) {
      const isLeader = member.user_id === team.leader_id ? '👑' : '👤';
      console.log(`   ${isLeader} ${member.email} (${member.role})`);
    }
    console.log();
  }
}

findTeamWithBothRoles();
