import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

type DosenSeed = {
  nama: string;
  email: string;
  phone: string;
  nip: string;
  jabatan: 'Asisten Ahli' | 'Lektor';
};

const dosenData: DosenSeed[] = [
  {
    nama: 'Dosen Asisten Ahli 01',
    email: 'dosen.asisten.01@univ.ac.id',
    phone: '081200000001',
    nip: 'DSNAA20260319001',
    jabatan: 'Asisten Ahli',
  },
  {
    nama: 'Dosen Asisten Ahli 02',
    email: 'dosen.asisten.02@univ.ac.id',
    phone: '081200000002',
    nip: 'DSNAA20260319002',
    jabatan: 'Asisten Ahli',
  },
  {
    nama: 'Dosen Asisten Ahli 03',
    email: 'dosen.asisten.03@univ.ac.id',
    phone: '081200000003',
    nip: 'DSNAA20260319003',
    jabatan: 'Asisten Ahli',
  },
  {
    nama: 'Dosen Asisten Ahli 04',
    email: 'dosen.asisten.04@univ.ac.id',
    phone: '081200000004',
    nip: 'DSNAA20260319004',
    jabatan: 'Asisten Ahli',
  },
  {
    nama: 'Dosen Asisten Ahli 05',
    email: 'dosen.asisten.05@univ.ac.id',
    phone: '081200000005',
    nip: 'DSNAA20260319005',
    jabatan: 'Asisten Ahli',
  },
  {
    nama: 'Dosen Lektor 01',
    email: 'dosen.lektor.01@univ.ac.id',
    phone: '081200000006',
    nip: 'DSNLK20260319001',
    jabatan: 'Lektor',
  },
  {
    nama: 'Dosen Lektor 02',
    email: 'dosen.lektor.02@univ.ac.id',
    phone: '081200000007',
    nip: 'DSNLK20260319002',
    jabatan: 'Lektor',
  },
  {
    nama: 'Dosen Lektor 03',
    email: 'dosen.lektor.03@univ.ac.id',
    phone: '081200000008',
    nip: 'DSNLK20260319003',
    jabatan: 'Lektor',
  },
  {
    nama: 'Dosen Lektor 04',
    email: 'dosen.lektor.04@univ.ac.id',
    phone: '081200000009',
    nip: 'DSNLK20260319004',
    jabatan: 'Lektor',
  },
  {
    nama: 'Dosen Lektor 05',
    email: 'dosen.lektor.05@univ.ac.id',
    phone: '081200000010',
    nip: 'DSNLK20260319005',
    jabatan: 'Lektor',
  },
];

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL tidak ditemukan di .env');
  }

  const sql = neon(process.env.DATABASE_URL);
  const passwordHash = await bcrypt.hash('dosen123', 10);

  let insertedUsers = 0;
  let insertedProfiles = 0;

  for (const row of dosenData) {
    const userId = `dosen-${row.nip.toLowerCase()}`;

    await sql`
      INSERT INTO users (id, nama, email, password, role, phone, is_active)
      VALUES (${userId}, ${row.nama}, ${row.email}, ${passwordHash}, 'DOSEN', ${row.phone}, true)
      ON CONFLICT (email)
      DO NOTHING
    `;

    const userCheck = await sql`
      SELECT id FROM users WHERE email = ${row.email} LIMIT 1
    `;

    if (userCheck.length > 0) {
      const id = userCheck[0].id as string;
      if (id === userId) {
        insertedUsers += 1;
      }

      await sql`
        INSERT INTO dosen (id, nip, jabatan, fakultas, prodi)
        VALUES (${id}, ${row.nip}, ${row.jabatan}, 'Fakultas Teknik', 'Teknik Informatika')
        ON CONFLICT (id)
        DO UPDATE SET
          nip = EXCLUDED.nip,
          jabatan = EXCLUDED.jabatan,
          fakultas = EXCLUDED.fakultas,
          prodi = EXCLUDED.prodi
      `;

      insertedProfiles += 1;
    }
  }

  const summary = await sql`
    SELECT jabatan, COUNT(*)::int AS total
    FROM dosen
    WHERE jabatan IN ('Asisten Ahli', 'Lektor')
      AND id IN (
        SELECT id
        FROM users
        WHERE email LIKE 'dosen.asisten.%@univ.ac.id'
           OR email LIKE 'dosen.lektor.%@univ.ac.id'
      )
    GROUP BY jabatan
    ORDER BY jabatan
  `;

  console.log('Seed DOSEN selesai.');
  console.log(`User diproses: ${insertedUsers}`);
  console.log(`Profile dosen diproses: ${insertedProfiles}`);
  console.table(summary);
  console.log('Password default untuk akun baru: dosen123');
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Gagal seed DOSEN:', err);
    process.exit(1);
  });