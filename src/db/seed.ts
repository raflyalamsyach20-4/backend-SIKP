import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { users, mahasiswa, admin, dosen } from './schema';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { generateId } from '@/utils/helpers';

dotenv.config({ path: '.env' });

const seed = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  console.log('🌱 Seeding database...');

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Insert admin user
    const adminUserId = generateId();
    await db.insert(users).values({
      id: adminUserId,
      nama: 'Super Admin',
      email: 'admin@univ.ac.id',
      password: hashedPassword,
      role: 'ADMIN',
      phone: '081234567890',
      isActive: true,
    });

    // Insert admin profile
    await db.insert(admin).values({
      id: adminUserId,
      nip: 'ADMIN001',
      fakultas: 'Fakultas Teknik',
      prodi: 'Teknik Informatika',
    });

    console.log('✅ Admin user created:');
    console.log('   Email: admin@univ.ac.id');
    console.log('   NIP: ADMIN001');
    console.log('   Password: admin123');
    console.log('');

    // Insert sample mahasiswa
    const mahasiswaPassword = await bcrypt.hash('password123', 10);

    const mahasiswa1Id = generateId();
    await db.insert(users).values({
      id: mahasiswa1Id,
      nama: 'Budi Santoso',
      email: 'budi.santoso@student.univ.ac.id',
      password: mahasiswaPassword,
      role: 'MAHASISWA',
      phone: '081234567891',
      isActive: true,
    });

    await db.insert(mahasiswa).values({
      nim: '2021001',
      id: mahasiswa1Id,
      fakultas: 'Fakultas Teknik',
      prodi: 'Teknik Informatika',
      semester: 6,
      angkatan: '2021',
    });

    const mahasiswa2Id = generateId();
    await db.insert(users).values({
      id: mahasiswa2Id,
      nama: 'Siti Nurhaliza',
      email: 'siti.nurhaliza@student.univ.ac.id',
      password: mahasiswaPassword,
      role: 'MAHASISWA',
      phone: '081234567892',
      isActive: true,
    });

    await db.insert(mahasiswa).values({
      nim: '2021002',
      id: mahasiswa2Id,
      fakultas: 'Fakultas Teknik',
      prodi: 'Sistem Informasi',
      semester: 6,
      angkatan: '2021',
    });

    console.log('✅ Sample mahasiswa created:');
    console.log('   Email: budi.santoso@student.univ.ac.id (NIM: 2021001)');
    console.log('   Email: siti.nurhaliza@student.univ.ac.id (NIM: 2021002)');
    console.log('   Password: password123');
    console.log('');

    // Insert sample dosen
    const dosenId = generateId();
    await db.insert(users).values({
      id: dosenId,
      nama: 'Dr. Ahmad Fauzi',
      email: 'ahmad.fauzi@univ.ac.id',
      password: hashedPassword,
      role: 'DOSEN',
      phone: '081234567893',
      isActive: true,
    });

    await db.insert(dosen).values({
      id: dosenId,
      nip: 'DOSEN001',
      jabatan: 'Lektor Kepala',
      fakultas: 'Fakultas Teknik',
      prodi: 'Teknik Informatika',
    });

    console.log('✅ Sample dosen created:');
    console.log('   Email: ahmad.fauzi@univ.ac.id');
    console.log('   NIP: DOSEN001');
    console.log('   Password: admin123');
    console.log('');

    console.log('✅ Seeding completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seed();
