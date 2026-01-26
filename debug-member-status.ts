import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in .env file');
}

const sql = neon(process.env.DATABASE_URL);

async function checkMemberStatus() {
  try {
    // Get all team members with their details
    const members = await sql`
      SELECT 
        tm.id,
        tm.user_id,
        u.nama,
        u.email,
        t.code as team_code,
        tm.role,
        tm.invitation_status,
        tm.invited_at,
        tm.responded_at
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      JOIN teams t ON tm.team_id = t.id
      ORDER BY t.code, tm.invitation_status DESC
    `;

    console.log('\n📋 Team Members Status:');
    console.log('======================\n');
    
    let currentTeam = '';
    for (const member of members) {
      if (currentTeam !== member.team_code) {
        currentTeam = member.team_code;
        console.log(`\n🏢 Team: ${member.team_code}`);
        console.log('-'.repeat(80));
      }
      
      const status = member.invitation_status === 'ACCEPTED' ? '✅ ACCEPTED' : `❌ ${member.invitation_status}`;
      console.log(`  ${member.nama} (${member.email})`);
      console.log(`    Role: ${member.role} | Status: ${status}`);
      console.log(`    Invited: ${member.invited_at ? new Date(member.invited_at).toLocaleDateString('id-ID') : 'N/A'}`);
      if (member.responded_at) {
        console.log(`    Responded: ${new Date(member.responded_at).toLocaleDateString('id-ID')}`);
      }
    }

    console.log('\n\n📊 Summary:');
    const accepted = members.filter((m: any) => m.invitation_status === 'ACCEPTED').length;
    const pending = members.filter((m: any) => m.invitation_status === 'PENDING').length;
    const rejected = members.filter((m: any) => m.invitation_status === 'REJECTED').length;
    
    console.log(`✅ ACCEPTED: ${accepted}`);
    console.log(`⏳ PENDING: ${pending}`);
    console.log(`❌ REJECTED: ${rejected}`);
    console.log(`📝 TOTAL: ${members.length}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkMemberStatus();
