import 'dotenv/config';
import { eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { teams, mahasiswa, users } from '@/db/schema';

const run = async () => {
  if (!db) {
    throw new Error('DATABASE_URL tidak ditemukan di .env');
  }

  console.log('\n📋 Update tim existing agar dosen_kp_id terisi dari dosen_pa_id ketua...\n');

  const teamsNeedUpdate = await db
    .select({
      id: teams.id,
      code: teams.code,
      leaderId: teams.leaderId,
      leaderNama: users.nama,
      dosenPaId: mahasiswa.dosenPaId,
    })
    .from(teams)
    .innerJoin(users, eq(users.id, teams.leaderId))
    .leftJoin(mahasiswa, eq(mahasiswa.id, teams.leaderId))
    .where(isNull(teams.dosenKpId));

  console.log(`Found ${teamsNeedUpdate.length} teams to update:\n`);
  console.table(teamsNeedUpdate);

  let updated = 0;
  for (const team of teamsNeedUpdate) {
    try {
      if (!team.dosenPaId) {
        console.log(`⚠️ Skip team ${team.code}: leader belum punya dosen_pa_id`);
        continue;
      }

      await db
        .update(teams)
        .set({ dosenKpId: team.dosenPaId })
        .where(eq(teams.id, team.id));

      console.log(`✓ Updated team ${team.code}: dosen_kp_id = ${team.dosenPaId}`);
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

  const allTeams = await db
    .select({
      id: teams.id,
      code: teams.code,
      leaderNama: users.nama,
      status: teams.status,
      dosenKpId: teams.dosenKpId,
    })
    .from(teams)
    .innerJoin(users, eq(users.id, teams.leaderId));

  const dosenIds = allTeams
    .map((team) => team.dosenKpId)
    .filter((id): id is string => !!id);

  const dosenNames = dosenIds.length
    ? await db
        .select({ id: users.id, nama: users.nama })
        .from(users)
        .where(inArray(users.id, dosenIds))
    : [];

  const dosenMap = new Map(dosenNames.map((row) => [row.id, row.nama]));

  const printed = allTeams.map((team) => ({
    id: team.id,
    code: team.code,
    leader_nama: team.leaderNama,
    status: team.status,
    dosen_kp_nama: team.dosenKpId ? dosenMap.get(team.dosenKpId) ?? null : null,
  }));

  console.table(printed);

  const teamsWithDosen = printed.filter((t) => !!t.dosen_kp_nama).length;
  const totalTeams = printed.length;

  console.log(`\n✅ Tim dengan Dosen KP: ${teamsWithDosen}/${totalTeams}`);
  console.log('═'.repeat(80) + '\n');
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Gagal:', err);
    process.exit(1);
  });
