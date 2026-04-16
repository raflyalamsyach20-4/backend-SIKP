import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL tidak ditemukan');
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log('\n' + '═'.repeat(80));
  console.log('🧹 CLEANUP: Delete old incorrect surat kesediaan requests');
  console.log('═'.repeat(80) + '\n');

  try {
    // 1. Find requests where dosen_user_id doesn't match team.dosen_kp_id
    console.log('📍 Step 1: Mencari requests yang tidak match dengan team dosen_kp...\n');
    const incorrectRequests = await sql`
      SELECT 
        sk.id,
        sk.member_user_id,
        m.nim,
        u_member.nama as member_nama,
        sk.dosen_user_id,
        u_dosen.nama as dosen_nama,
        t.dosen_kp_id,
        u_expected_kp.nama as expected_dosen_kp_nama,
        sk.created_at
      FROM surat_kesediaan_requests sk
      JOIN users u_member ON u_member.id = sk.member_user_id
      LEFT JOIN mahasiswa m ON m.id = sk.member_user_id
      JOIN users u_dosen ON u_dosen.id = sk.dosen_user_id
      JOIN team_members tm ON tm.user_id = sk.member_user_id AND tm.invitation_status = 'ACCEPTED'
      JOIN teams t ON t.id = tm.team_id AND t.status = 'FIXED'
      LEFT JOIN users u_expected_kp ON u_expected_kp.id = t.dosen_kp_id
      WHERE sk.dosen_user_id <> t.dosen_kp_id
      AND sk.status = 'MENUNGGU'
    `;

    if (incorrectRequests.length === 0) {
      console.log('✅ Tidak ada requests dengan dosen yang salah.\n');
      console.log('═'.repeat(80) + '\n');
      process.exit(0);
    }

    console.log(`Ditemukan ${incorrectRequests.length} requests dengan dosen yang salah:\n`);
    incorrectRequests.forEach((req: any, idx: number) => {
      console.log(`${idx + 1}. ${req.member_nama} (${req.nim})`);
      console.log(`   Request ID: ${req.id}`);
      console.log(`   Dibuat: ${req.created_at}`);
      console.log(`   Dosen saat ini: ${req.dosen_nama} ❌ SALAH`);
      console.log(`   Dosen seharusnya: ${req.expected_dosen_kp_nama} ✅ BENAR\n`);
    });

    // 2. Delete these requests
    console.log('🗑️  Menghapus requests yang tidak correct...\n');
    for (const req of incorrectRequests) {
      await sql`DELETE FROM surat_kesediaan_requests WHERE id = ${req.id}`;
      console.log(`✓ Deleted: ${req.id}`);
    }

    console.log(`\n✅ Berhasil menghapus ${incorrectRequests.length} requests yang tidak correct.\n`);

    // 3. Verify
    console.log('📍 Step 2: Verifikasi...\n');
    const remaining = await sql`
      SELECT sk.dosen_user_id, t.dosen_kp_id
      FROM surat_kesediaan_requests sk
      JOIN team_members tm ON tm.user_id = sk.member_user_id AND tm.invitation_status = 'ACCEPTED'
      JOIN teams t ON t.id = tm.team_id AND t.status = 'FIXED'
      WHERE sk.dosen_user_id <> t.dosen_kp_id
      AND sk.status = 'MENUNGGU'
    `;

    if (remaining.length === 0) {
      console.log('✅ Semua existing requests sekarang correct (dosen_user_id = team.dosen_kp_id).\n');
    } else {
      console.log(`⚠️ Masih ada ${remaining.length} requests dengan mismatch:\n`);
      remaining.forEach((row: any) => {
        console.log(`  Dosen: ${row.dosen_user_id}, Expected: ${row.dosen_kp_id}`);
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
