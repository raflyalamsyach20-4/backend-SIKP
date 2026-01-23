import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);

async function debugUsers() {
  console.log('📋 Checking users in database...\n');

  // Get first 5 users with team memberships
  const users = await sql`
    SELECT DISTINCT
      u.id,
      u.email,
      u.role,
      u.password,
      COUNT(tm.id) as team_count
    FROM users u
    LEFT JOIN team_members tm ON u.id = tm.user_id
    GROUP BY u.id, u.email, u.role, u.password
    LIMIT 5
  `;

  console.log('Users in database:');
  for (const user of users) {
    console.log(`\n📧 ${user.email}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Teams: ${user.team_count}`);
    console.log(`   Password hash length: ${(user.password || '').length}`);
  }

  // Get ANGGOTA members
  console.log('\n\n═══════════════════════════');
  console.log('ANGGOTA Members:\n');

  const anggota = await sql`
    SELECT 
      tm.id as member_id,
      tm.user_id,
      tm.team_id,
      u.email,
      u.password,
      t.code as team_code,
      tm.role,
      tm.invitation_status
    FROM team_members tm
    JOIN users u ON tm.user_id = u.id
    JOIN teams t ON tm.team_id = t.id
    WHERE tm.role = 'ANGGOTA' AND tm.invitation_status = 'ACCEPTED'
    LIMIT 5
  `;

  for (const member of anggota) {
    console.log(`📌 ${member.email} - Team: ${member.team_code}`);
    console.log(`   User ID: ${member.user_id}`);
    console.log(`   Role: ${member.role}`);
    console.log(`   Status: ${member.invitation_status}`);
    console.log(`   Password length: ${(member.password || '').length}`);
  }
}

debugUsers();
