import { eq } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { users, mahasiswa, admin, dosen, pembimbingLapangan } from '@/db/schema';

export class UserRepository {
  constructor(private db: DbClient) {}

  // User operations
  async findByEmail(email: string) {
    const result = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0] || null;
  }

  async findById(id: string) {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] || null;
  }

  async create(data: typeof users.$inferInsert) {
    const result = await this.db.insert(users).values(data).returning();
    return result[0];
  }

  async update(id: string, data: Partial<typeof users.$inferInsert>) {
    const result = await this.db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  // Mahasiswa operations
  async findMahasiswaByNim(nim: string) {
    const result = await this.db.select().from(mahasiswa).where(eq(mahasiswa.nim, nim)).limit(1);
    return result[0] || null;
  }

  async findMahasiswaByUserId(userId: string) {
    const result = await this.db.select().from(mahasiswa).where(eq(mahasiswa.id, userId)).limit(1);
    return result[0] || null;
  }

  async createMahasiswa(data: typeof mahasiswa.$inferInsert) {
    const result = await this.db.insert(mahasiswa).values(data).returning();
    return result[0];
  }

  async updateMahasiswa(nim: string, data: Partial<typeof mahasiswa.$inferInsert>) {
    const result = await this.db
      .update(mahasiswa)
      .set(data)
      .where(eq(mahasiswa.nim, nim))
      .returning();
    return result[0];
  }

  // Admin operations
  async findAdminByNip(nip: string) {
    const result = await this.db.select().from(admin).where(eq(admin.nip, nip)).limit(1);
    return result[0] || null;
  }

  async findAdminByUserId(userId: string) {
    const result = await this.db.select().from(admin).where(eq(admin.id, userId)).limit(1);
    return result[0] || null;
  }

  async createAdmin(data: typeof admin.$inferInsert) {
    const result = await this.db.insert(admin).values(data).returning();
    return result[0];
  }

  // Dosen operations
  async findDosenByNip(nip: string) {
    const result = await this.db.select().from(dosen).where(eq(dosen.nip, nip)).limit(1);
    return result[0] || null;
  }

  async findDosenByUserId(userId: string) {
    const result = await this.db.select().from(dosen).where(eq(dosen.id, userId)).limit(1);
    return result[0] || null;
  }

  async createDosen(data: typeof dosen.$inferInsert) {
    const result = await this.db.insert(dosen).values(data).returning();
    return result[0];
  }

  // Pembimbing Lapangan operations
  async findPembimbingLapanganByUserId(userId: string) {
    const result = await this.db.select().from(pembimbingLapangan).where(eq(pembimbingLapangan.id, userId)).limit(1);
    return result[0] || null;
  }

  async createPembimbingLapangan(data: typeof pembimbingLapangan.$inferInsert) {
    const result = await this.db.insert(pembimbingLapangan).values(data).returning();
    return result[0];
  }

  // Get user with profile
  async getUserWithProfile(userId: string) {
    const user = await this.findById(userId);
    if (!user) return null;

    let profile = null;
    switch (user.role) {
      case 'MAHASISWA':
        profile = await this.findMahasiswaByUserId(userId);
        break;
      case 'ADMIN':
      case 'KAPRODI':
      case 'WAKIL_DEKAN':
        profile = await this.findAdminByUserId(userId);
        break;
      case 'DOSEN':
        profile = await this.findDosenByUserId(userId);
        break;
      case 'PEMBIMBING_LAPANGAN':
        profile = await this.findPembimbingLapanganByUserId(userId);
        break;
    }

    return { user, profile };
  }
}
