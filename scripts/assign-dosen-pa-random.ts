import 'dotenv/config';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { dosen, mahasiswa, users } from '@/db/schema';

const run = async () => {
  if (!db) {
    throw new Error('DATABASE_URL tidak ditemukan di .env');
  }

  const dosenList = await db
    .select({ id: dosen.id })
    .from(dosen)
    .innerJoin(users, eq(users.id, dosen.id))
    .where(inArray(dosen.jabatan, ['Asisten Ahli', 'Lektor']))
    .orderBy(dosen.id);

  if (dosenList.length === 0) {
    console.error('❌ Tidak ada dosen dengan jabatan Asisten Ahli atau Lektor');
    process.exit(1);
  }

  const mahasiswaList = await db
    .select({ nim: mahasiswa.nim, id: mahasiswa.id })
    .from(mahasiswa)
    .where(isNull(mahasiswa.dosenPaId))
    .orderBy(mahasiswa.id);

  if (mahasiswaList.length === 0) {
    console.log('✅ Semua mahasiswa sudah memiliki dosen PA');
    process.exit(0);
  }

  console.log(`🎯 Melakukan assignment dosen PA...`);
  console.log(`   Dosen tersedia: ${dosenList.length}`);
  console.log(`   Mahasiswa yang perlu assign: ${mahasiswaList.length}\n`);

  let assignedCount = 0;

  for (const mhs of mahasiswaList) {
    // Random pick dosen
    const randomIndex = Math.floor(Math.random() * dosenList.length);
    const selectedDosen = dosenList[randomIndex];

    await db
      .update(mahasiswa)
      .set({ dosenPaId: selectedDosen.id })
      .where(eq(mahasiswa.id, mhs.id));

    assignedCount++;
    console.log(`✓ MHS ${mhs.nim} → DOSEN ${selectedDosen.id}`);
  }

  console.log(`\n✅ Assignment selesai: ${assignedCount}/${mahasiswaList.length} mahasiswa\n`);

  // Verify result
  console.log('═'.repeat(80));
  console.log('📊 HASIL ASSIGNMENT (per dosen)');
  console.log('═'.repeat(80));

  const result = await db
    .select({
      id: dosen.id,
      dosenNama: users.nama,
      jabatan: dosen.jabatan,
    })
    .from(dosen)
    .innerJoin(users, eq(users.id, dosen.id))
    .where(inArray(dosen.jabatan, ['Asisten Ahli', 'Lektor']))
    .orderBy(dosen.jabatan, users.nama);

  const mahasiswaByDosen = await db
    .select({ id: mahasiswa.id, dosenPaId: mahasiswa.dosenPaId })
    .from(mahasiswa)
    .where(inArray(mahasiswa.dosenPaId, result.map((row) => row.id)));

  console.log('\n');
  console.table(
    result.map((row) => ({
      id: row.id,
      dosen_nama: row.dosenNama,
      jabatan: row.jabatan,
      jumlah_mahasiswa: mahasiswaByDosen.filter((mhs) => mhs.dosenPaId === row.id).length,
    }))
  );
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Gagal assign dosen PA:', err);
    process.exit(1);
  });
