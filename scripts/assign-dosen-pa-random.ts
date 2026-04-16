import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL tidak ditemukan di .env');
  }

  const sql = neon(process.env.DATABASE_URL);

  // Get all dosen with jabatan 'Asisten Ahli' or 'Lektor'
  const dosenList = await sql`
    SELECT d.id
    FROM dosen d
    JOIN users u ON u.id = d.id
    WHERE d.jabatan IN ('Asisten Ahli', 'Lektor')
    ORDER BY d.id
  `;

  if (dosenList.length === 0) {
    console.error('❌ Tidak ada dosen dengan jabatan Asisten Ahli atau Lektor');
    process.exit(1);
  }

  // Get all mahasiswa yang belum punya dosen PA
  const mahasiswaList = await sql`
    SELECT m.nim, m.id
    FROM mahasiswa m
    WHERE m.dosen_pa_id IS NULL
    ORDER BY m.id
  `;

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

    await sql`
      UPDATE mahasiswa
      SET dosen_pa_id = ${selectedDosen.id}
      WHERE id = ${mhs.id}
    `;

    assignedCount++;
    console.log(`✓ MHS ${mhs.nim} → DOSEN ${selectedDosen.id}`);
  }

  console.log(`\n✅ Assignment selesai: ${assignedCount}/${mahasiswaList.length} mahasiswa\n`);

  // Verify result
  console.log('═'.repeat(80));
  console.log('📊 HASIL ASSIGNMENT (per dosen)');
  console.log('═'.repeat(80));

  const result = await sql`
    SELECT 
      d.id,
      u.nama as dosen_nama,
      d.jabatan,
      COUNT(m.id) as jumlah_mahasiswa,
      ARRAY_AGG(mu.nama) as mahasiswa_list
    FROM dosen d
    JOIN users u ON u.id = d.id
    LEFT JOIN mahasiswa m ON m.dosen_pa_id = d.id
    LEFT JOIN users mu ON mu.id = m.id
    WHERE d.jabatan IN ('Asisten Ahli', 'Lektor')
    GROUP BY d.id, u.nama, d.jabatan
    ORDER BY d.jabatan, u.nama
  `;

  console.log('\n');
  console.table(result);
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Gagal assign dosen PA:', err);
    process.exit(1);
  });
