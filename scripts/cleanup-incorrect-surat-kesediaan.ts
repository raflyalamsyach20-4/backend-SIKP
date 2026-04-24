import 'dotenv/config';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/db';
import { suratKesediaanRequests, teamMembers, teams, users, mahasiswa } from '@/db/schema';

const run = async () => {
  if (!db) {
    throw new Error('DATABASE_URL tidak ditemukan');
  }

  console.log('\n' + '═'.repeat(80));
  console.log('🧹 CLEANUP: Delete old incorrect surat kesediaan requests');
  console.log('═'.repeat(80) + '\n');

  try {
    // 1. Find requests where dosen_user_id doesn't match team.dosen_kp_id
    console.log('📍 Step 1: Mencari requests yang tidak match dengan team dosen_kp...\n');
    const incorrectRequests = await db
      .select({
        id: suratKesediaanRequests.id,
        memberUserId: suratKesediaanRequests.memberUserId,
        dosenUserId: suratKesediaanRequests.dosenUserId,
        dosenKpId: teams.dosenKpId,
        createdAt: suratKesediaanRequests.createdAt,
        nim: mahasiswa.nim,
      })
      .from(suratKesediaanRequests)
      .innerJoin(
        teamMembers,
        and(
          eq(teamMembers.userId, suratKesediaanRequests.memberUserId),
          eq(teamMembers.invitationStatus, 'ACCEPTED')
        )
      )
      .innerJoin(
        teams,
        and(eq(teams.id, teamMembers.teamId), eq(teams.status, 'FIXED'))
      )
      .leftJoin(mahasiswa, eq(mahasiswa.id, suratKesediaanRequests.memberUserId))
      .where(
        and(
          eq(suratKesediaanRequests.status, 'MENUNGGU'),
          ne(suratKesediaanRequests.dosenUserId, teams.dosenKpId)
        )
      );

    const userIds = Array.from(
      new Set(
        incorrectRequests.flatMap((req) => [req.memberUserId, req.dosenUserId, req.dosenKpId ?? ''])
      )
    ).filter((id): id is string => !!id);

    const userRows = userIds.length
      ? await db
          .select({ id: users.id, nama: users.nama })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];

    const userMap = new Map(userRows.map((row) => [row.id, row.nama]));

    if (incorrectRequests.length === 0) {
      console.log('✅ Tidak ada requests dengan dosen yang salah.\n');
      console.log('═'.repeat(80) + '\n');
      process.exit(0);
    }

    console.log(`Ditemukan ${incorrectRequests.length} requests dengan dosen yang salah:\n`);
    incorrectRequests.forEach((req, idx: number) => {
      console.log(`${idx + 1}. ${userMap.get(req.memberUserId) ?? '-'} (${req.nim ?? '-'})`);
      console.log(`   Request ID: ${req.id}`);
      console.log(`   Dibuat: ${req.createdAt}`);
      console.log(`   Dosen saat ini: ${userMap.get(req.dosenUserId) ?? req.dosenUserId} ❌ SALAH`);
      console.log(`   Dosen seharusnya: ${userMap.get(req.dosenKpId ?? '') ?? req.dosenKpId ?? '-'} ✅ BENAR\n`);
    });

    // 2. Delete these requests
    console.log('🗑️  Menghapus requests yang tidak correct...\n');
    for (const req of incorrectRequests) {
      await db.delete(suratKesediaanRequests).where(eq(suratKesediaanRequests.id, req.id));
      console.log(`✓ Deleted: ${req.id}`);
    }

    console.log(`\n✅ Berhasil menghapus ${incorrectRequests.length} requests yang tidak correct.\n`);

    // 3. Verify
    console.log('📍 Step 2: Verifikasi...\n');
    const remaining = await db
      .select({
        dosenUserId: suratKesediaanRequests.dosenUserId,
        dosenKpId: teams.dosenKpId,
      })
      .from(suratKesediaanRequests)
      .innerJoin(
        teamMembers,
        and(
          eq(teamMembers.userId, suratKesediaanRequests.memberUserId),
          eq(teamMembers.invitationStatus, 'ACCEPTED')
        )
      )
      .innerJoin(
        teams,
        and(eq(teams.id, teamMembers.teamId), eq(teams.status, 'FIXED'))
      )
      .where(
        and(
          eq(suratKesediaanRequests.status, 'MENUNGGU'),
          ne(suratKesediaanRequests.dosenUserId, teams.dosenKpId)
        )
      );

    if (remaining.length === 0) {
      console.log('✅ Semua existing requests sekarang correct (dosen_user_id = team.dosen_kp_id).\n');
    } else {
      console.log(`⚠️ Masih ada ${remaining.length} requests dengan mismatch:\n`);
      remaining.forEach((row) => {
        console.log(`  Dosen: ${row.dosenUserId}, Expected: ${row.dosenKpId}`);
      });
    }

    console.log('═'.repeat(80) + '\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
