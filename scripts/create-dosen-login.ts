import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env' });

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
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);
  const hashedPassword = await bcrypt.hash(DOSEN_LOGIN.password, 10);

  // Ensure unique NIP if this script is run on a DB where the NIP already belongs to another user.
  let finalNip = DOSEN_LOGIN.nip;
  const nipOwner = await sql`SELECT id FROM "dosen" WHERE "nip" = ${finalNip} LIMIT 1`;

  let userId: string;
  const existingUser = await sql`SELECT id FROM "users" WHERE "email" = ${DOSEN_LOGIN.email} LIMIT 1`;
  if (existingUser.length > 0) {
    userId = String(existingUser[0].id);
  } else {
    userId = generateId();
  }

  if (nipOwner.length > 0 && String(nipOwner[0].id) !== userId) {
    finalNip = `${DOSEN_LOGIN.nip}_${Date.now().toString().slice(-4)}`;
  }

  await sql`
    INSERT INTO "users" ("id", "nama", "email", "password", "role", "phone", "is_active")
    VALUES (${userId}, ${DOSEN_LOGIN.nama}, ${DOSEN_LOGIN.email}, ${hashedPassword}, 'DOSEN', ${DOSEN_LOGIN.phone}, true)
    ON CONFLICT ("id") DO UPDATE SET
      "nama" = EXCLUDED."nama",
      "email" = EXCLUDED."email",
      "password" = EXCLUDED."password",
      "role" = EXCLUDED."role",
      "phone" = EXCLUDED."phone",
      "is_active" = EXCLUDED."is_active";
  `;

  const existingDosen = await sql`SELECT id FROM "dosen" WHERE "id" = ${userId} LIMIT 1`;
  if (existingDosen.length > 0) {
    await sql`
      UPDATE "dosen"
      SET
        "nip" = ${finalNip},
        "jabatan" = ${DOSEN_LOGIN.jabatan},
        "fakultas" = ${DOSEN_LOGIN.fakultas},
        "prodi" = ${DOSEN_LOGIN.prodi}
      WHERE "id" = ${userId};
    `;
  } else {
    await sql`
      INSERT INTO "dosen" ("id", "nip", "jabatan", "fakultas", "prodi")
      VALUES (${userId}, ${finalNip}, ${DOSEN_LOGIN.jabatan}, ${DOSEN_LOGIN.fakultas}, ${DOSEN_LOGIN.prodi});
    `;
  }

  const verify = await sql`
    SELECT u.id, u.nama, u.email, u.role, u.is_active, d.nip, d.jabatan, d.fakultas, d.prodi
    FROM "users" u
    INNER JOIN "dosen" d ON d.id = u.id
    WHERE u.email = ${DOSEN_LOGIN.email}
    LIMIT 1;
  `;

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
