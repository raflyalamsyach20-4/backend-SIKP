import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);

async function debugTeamMembers() {
  console.log('\n🔍 DEBUG: Checking team_members table\n');
  
  try {
    // Get all team members
    const allMembers = await sql`
      SELECT 
        tm.id,
        tm.team_id,
        tm.user_id,
        tm.role,
        tm.invitation_status,
        tm.invited_at,
        u.nama as user_name,
        u.email as user_email,
        t.code as team_code,
        t.leader_id
      FROM team_members tm
      LEFT JOIN users u ON tm.user_id = u.id
      LEFT JOIN teams t ON tm.team_id = t.id
      ORDER BY tm.invited_at DESC
      LIMIT 20
    `;
    
    console.log('📋 All Team Members (Last 20):');
    console.table(allMembers);
    
    // Count by role
    const roleCounts = await sql`
      SELECT role, COUNT(*) as count 
      FROM team_members 
      GROUP BY role
    `;
    
    console.log('\n📊 Team Members by Role:');
    console.table(roleCounts);
    
    // Teams with member count
    const teamsInfo = await sql`
      SELECT 
        t.id,
        t.code,
        t.leader_id,
        u.nama as leader_name,
        COUNT(tm.id) as member_count
      FROM teams t
      LEFT JOIN users u ON t.leader_id = u.id
      LEFT JOIN team_members tm ON t.id = tm.team_id
      GROUP BY t.id, u.nama
      ORDER BY t.id DESC
      LIMIT 10
    `;
    
    console.log('\n👥 Teams with Member Count:');
    console.table(teamsInfo);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

debugTeamMembers();
