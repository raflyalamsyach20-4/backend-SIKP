import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { and, eq, or, like, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { users, dosen } from '@/db/schema';

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
  if (!db) {
    throw new Error('DATABASE_URL tidak ditemukan di .env');
  }

  const passwordHash = await bcrypt.hash('dosen123', 10);

  let insertedUsers = 0;
  let insertedProfiles = 0;

  for (const row of dosenData) {
    const userId = `dosen-${row.nip.toLowerCase()}`;

    await db
      .insert(users)
      .values({
        id: userId,
        nama: row.nama,
        email: row.email,
        password: passwordHash,
        role: 'DOSEN',
        phone: row.phone,
        isActive: true,
      })
      .onConflictDoNothing({ target: users.email });

    const userCheck = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, row.email))
      .limit(1);

    if (userCheck.length > 0) {
      const id = userCheck[0].id as string;
      if (id === userId) {
        insertedUsers += 1;
      }

      await db
        .insert(dosen)
        .values({
          id,
          nip: row.nip,
          jabatan: row.jabatan,
          fakultas: 'Fakultas Teknik',
          prodi: 'Teknik Informatika',
        })
        .onConflictDoUpdate({
          target: dosen.id,
          set: {
            nip: row.nip,
            jabatan: row.jabatan,
            fakultas: 'Fakultas Teknik',
            prodi: 'Teknik Informatika',
          },
        });

      insertedProfiles += 1;
    }
  }

  const summaryRows = await db
    .select({ jabatan: dosen.jabatan, email: users.email })
    .from(dosen)
    .innerJoin(users, eq(users.id, dosen.id))
    .where(
      and(
        inArray(dosen.jabatan, ['Asisten Ahli', 'Lektor']),
        or(
          like(users.email, 'dosen.asisten.%@univ.ac.id'),
          like(users.email, 'dosen.lektor.%@univ.ac.id')
        )
      )
    );

  const summary = Array.from(
    summaryRows.reduce((acc, row) => {
      const jabatan = row.jabatan ?? '-';
      acc.set(jabatan, (acc.get(jabatan) ?? 0) + 1);
      return acc;
    }, new Map<string, number>())
  ).map(([jabatan, total]) => ({ jabatan, total }));

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