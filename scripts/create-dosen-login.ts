import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, dosen } from '@/db/schema';

const DOSEN_LOGIN = {
  nama: 'Dr. Dosen Testing',
  email: 'dosen.testing@univ.ac.id',
  password: 'dosen123',
  nip: 'DOSEN9001',
  jabatan: 'Lektor',
  fakultas: 'Fakultas Teknik',
  prodi: 'Teknik Informatika',
  phone: '081234560001',
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const run = async () => {
  if (!db) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const hashedPassword = await bcrypt.hash(DOSEN_LOGIN.password, 10);

  // Ensure unique NIP if this script is run on a DB where the NIP already belongs to another user.
  let finalNip = DOSEN_LOGIN.nip;
  const nipOwner = await db
    .select({ id: dosen.id })
    .from(dosen)
    .where(eq(dosen.nip, finalNip))
    .limit(1);

  let userId: string;
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DOSEN_LOGIN.email))
    .limit(1);
  if (existingUser.length > 0) {
    userId = String(existingUser[0].id);
  } else {
    userId = generateId();
  }

  if (nipOwner.length > 0 && String(nipOwner[0].id) !== userId) {
    finalNip = `${DOSEN_LOGIN.nip}_${Date.now().toString().slice(-4)}`;
  }

  await db
    .insert(users)
    .values({
      id: userId,
      nama: DOSEN_LOGIN.nama,
      email: DOSEN_LOGIN.email,
      password: hashedPassword,
      role: 'DOSEN',
      phone: DOSEN_LOGIN.phone,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        nama: DOSEN_LOGIN.nama,
        email: DOSEN_LOGIN.email,
        password: hashedPassword,
        role: 'DOSEN',
        phone: DOSEN_LOGIN.phone,
        isActive: true,
      },
    });

  const existingDosen = await db
    .select({ id: dosen.id })
    .from(dosen)
    .where(eq(dosen.id, userId))
    .limit(1);

  if (existingDosen.length > 0) {
    await db
      .update(dosen)
      .set({
        nip: finalNip,
        jabatan: DOSEN_LOGIN.jabatan,
        fakultas: DOSEN_LOGIN.fakultas,
        prodi: DOSEN_LOGIN.prodi,
      })
      .where(eq(dosen.id, userId));
  } else {
    await db.insert(dosen).values({
      id: userId,
      nip: finalNip,
      jabatan: DOSEN_LOGIN.jabatan,
      fakultas: DOSEN_LOGIN.fakultas,
      prodi: DOSEN_LOGIN.prodi,
    });
  }

  const verify = await db
    .select({
      id: users.id,
      nama: users.nama,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      nip: dosen.nip,
      jabatan: dosen.jabatan,
      fakultas: dosen.fakultas,
      prodi: dosen.prodi,
    })
    .from(users)
    .innerJoin(dosen, eq(dosen.id, users.id))
    .where(eq(users.email, DOSEN_LOGIN.email))
    .limit(1);

  console.log('✅ Dosen login account is ready');
  console.log(`Email    : ${DOSEN_LOGIN.email}`);
  console.log(`Password : ${DOSEN_LOGIN.password}`);
  console.log(`NIP      : ${finalNip}`);
  console.log('User row :', verify[0]);
};

run().catch((error) => {
  console.error('❌ Failed to create dosen login:', error);
  process.exit(1);
});
