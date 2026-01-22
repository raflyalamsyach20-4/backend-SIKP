import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);

async function findAnggota() {
  console.log('🔍 Finding ANGGOTA members...\n');

  const anggota = await sql`
    SELECT 
      tm.id as member_id,
      tm.user_id,
      tm.team_id,
      u.email,
      t.code as team_code,
      t.leader_id,
      tm.role,
      tm.invitation_status
    FROM team_members tm
    JOIN users u ON tm.user_id = u.id
    JOIN teams t ON tm.team_id = t.id
    WHERE tm.role = 'ANGGOTA' 
      AND tm.invitation_status = 'ACCEPTED'
      AND t.leader_id != tm.user_id
    LIMIT 10
  `;

  console.log(`Found ${anggota.length} ANGGOTA members:\n`);

  for (const member of anggota) {
    console.log(`📌 ${member.email}`);
    console.log(`   Team: ${member.team_code}`);
    console.log(`   Role: ${member.role}`);
    console.log(`   Status: ${member.invitation_status}`);
    console.log(`   Team Leader ID: ${member.leader_id}`);
    console.log(`   User ID: ${member.user_id}`);
    console.log();
  }
}

findAnggota();
