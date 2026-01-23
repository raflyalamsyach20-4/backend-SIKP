import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);

async function checkTeamMembers() {
  console.log('\n📋 Checking team_members table...\n');
  
  const members = await sql`
    SELECT 
      tm.id,
      tm.team_id,
      tm.user_id,
      tm.invitation_status,
      tm.invited_by,
      tm.invited_at,
      u.nama as user_name,
      u.email as user_email
    FROM team_members tm
    LEFT JOIN users u ON tm.user_id = u.id
    ORDER BY tm.invited_at DESC
  `;
  
  console.table(members);
  
  console.log('\n✅ Check completed!\n');
}

checkTeamMembers().catch(console.error);
