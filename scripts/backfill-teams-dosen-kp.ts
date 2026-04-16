import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL tidak ditemukan di .env');
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log('\n📋 Update tim existing agar dosen_kp_id terisi dari dosen_pa_id ketua...\n');

  // Get all teams with null dosen_kp_id
  const teamsNeedUpdate = await sql`
    SELECT 
      t.id,
      t.code,
      t.leader_id,
      u.nama as leader_nama,
      m.dosen_pa_id
    FROM teams t
    JOIN users u ON u.id = t.leader_id
    JOIN mahasiswa m ON m.id = t.leader_id
    WHERE t.dosen_kp_id IS NULL
  `;

  console.log(`Found ${teamsNeedUpdate.length} teams to update:\n`);
  console.table(teamsNeedUpdate);

  let updated = 0;
  for (const team of teamsNeedUpdate) {
    try {
      await sql`
        UPDATE teams
        SET dosen_kp_id = ${team.dosen_pa_id}
        WHERE id = ${team.id}
      `;
      console.log(`✓ Updated team ${team.code}: dosen_kp_id = ${team.dosen_pa_id}`);
      updated++;
    } catch (err) {
      console.error(`✗ Failed to update team ${team.code}:`, err);
    }
  }

  console.log(`\n✅ Updated ${updated}/${teamsNeedUpdate.length} teams\n`);

  // Verify all teams now have dosen_kp_id assigned
  console.log('─'.repeat(80));
  console.log('📊 FINAL VERIFICATION: Semua Tim dengan Dosen KP');
  console.log('─'.repeat(80) + '\n');

  const allTeams = await sql`
    SELECT 
      t.id,
      t.code,
      u.nama as leader_nama,
      t.status,
      d_kp.nama as dosen_kp_nama
    FROM teams t
    JOIN users u ON u.id = t.leader_id
    LEFT JOIN users d_kp ON d_kp.id = t.dosen_kp_id
    ORDER BY t.id DESC
  `;

  console.table(allTeams);

  const teamsWithDosen = allTeams.filter((t: any) => t.dosen_kp_nama).length;
  const totalTeams = allTeams.length;

  console.log(`\n✅ Tim dengan Dosen KP: ${teamsWithDosen}/${totalTeams}`);
  console.log('═'.repeat(80) + '\n');
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Gagal:', err);
    process.exit(1);
  });
