/**
 * Setup test data: Create team with KETUA and multiple ANGGOTA
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { generateId } from '@/utils/helpers';

dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL!);

async function setupTestData() {
  console.log('🔧 Setting up test data...\n');

  try {
    // Get two existing mahasiswa users
    const users = await sql`
      SELECT id, email, nama FROM users 
      WHERE role = 'MAHASISWA' 
      LIMIT 2
    `;

    if (users.length < 2) {
      console.error('❌ Need at least 2 mahasiswa users');
      process.exit(1);
    }

    const ketua = users[0];
    const anggota = users[1];

    console.log(`👑 KETUA: ${ketua.email}`);
    console.log(`👤 ANGGOTA: ${anggota.email}\n`);

    // Create new team
    const teamId = generateId();
    const teamCode = `TEAM-${Math.random().toString(36).substring(2, 10).toUpperCase()}-TEST`;

    console.log(`📋 Creating team: ${teamCode}`);

    await sql`
      INSERT INTO teams (
        id, code, leader_id, status
      ) VALUES (
        ${teamId},
        ${teamCode},
        ${ketua.id},
        'FIXED'
      )
    `;

    console.log(`✅ Team created\n`);

    // Add KETUA as KETUA
    console.log(`📋 Adding KETUA as member...`);

    await sql`
      INSERT INTO team_members (
        id, team_id, user_id, role, 
        invitation_status, invited_at, responded_at
      ) VALUES (
        ${generateId()},
        ${teamId},
        ${ketua.id},
        'KETUA',
        'ACCEPTED',
        NOW(),
        NOW()
      )
    `;

    console.log(`✅ KETUA added\n`);

    // Add ANGGOTA as ANGGOTA
    console.log(`📋 Adding ANGGOTA as member...`);

    await sql`
      INSERT INTO team_members (
        id, team_id, user_id, role, 
        invitation_status, invited_at, responded_at
      ) VALUES (
        ${generateId()},
        ${teamId},
        ${anggota.id},
        'ANGGOTA',
        'ACCEPTED',
        NOW(),
        NOW()
      )
    `;

    console.log(`✅ ANGGOTA added\n`);

    console.log('═'.repeat(70));
    console.log('\n📊 TEST DATA READY:\n');
    console.log(`Team ID: ${teamId}`);
    console.log(`Team Code: ${teamCode}`);
    console.log(`KETUA Email: ${ketua.email} (password: rafly123 or hikmah123)`);
    console.log(`ANGGOTA Email: ${anggota.email} (password: password123 or rafly123 or hikmah123)\n`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupTestData();
