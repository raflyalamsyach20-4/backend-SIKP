import { eq, or, ilike, sql, and, not } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { users, mahasiswa, admin, dosen, pembimbingLapangan } from '@/db/schema';

export class UserRepository {
  constructor(private db: DbClient) {}

  async getRandomDosenPA() {
    const dosenList = await this.db
      .select({
        id: dosen.id,
        nama: users.nama,
        jabatan: dosen.jabatan,
      })
      .from(dosen)
      .innerJoin(users, eq(users.id, dosen.id))
      .where(eq(users.isActive, true))
      .orderBy(sql`RANDOM()`)
      .limit(1);

    return dosenList[0] || null;
  }

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

  async countMahasiswaBySemester(semester: number) {
    const result = await this.db.select().from(mahasiswa).where(eq(mahasiswa.semester, semester));
    return result.length;
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

  async updateMahasiswaByUserId(userId: string, data: Partial<typeof mahasiswa.$inferInsert>) {
    const result = await this.db
      .update(mahasiswa)
      .set(data)
      .where(eq(mahasiswa.id, userId))
      .returning();
    return result[0] || null;
  }

  async getMahasiswaMe(userId: string) {
    const result = await this.db
      .select({
        id: users.id,
        nama: users.nama,
        email: users.email,
        role: users.role,
        phone: users.phone,
        nim: mahasiswa.nim,
        fakultas: mahasiswa.fakultas,
        prodi: mahasiswa.prodi,
        semester: mahasiswa.semester,
        jumlahSksSelesai: mahasiswa.jumlahSksSelesai,
        angkatan: mahasiswa.angkatan,
        esignatureUrl: mahasiswa.esignatureUrl,
        esignatureKey: mahasiswa.esignatureKey,
        esignatureUploadedAt: mahasiswa.esignatureUploadedAt,
      })
      .from(users)
      .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
      .where(eq(users.id, userId))
      .limit(1);

    return result[0] || null;
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

  async findActiveDosenByProdi(prodi: string) {
    const result = await this.db
      .select({
        id: users.id,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .innerJoin(dosen, eq(users.id, dosen.id))
      .where(
        and(
          eq(users.role, 'DOSEN'),
          eq(users.isActive, true),
          eq(dosen.prodi, prodi),
          not(ilike(dosen.jabatan, '%wakil dekan%'))
        )
      )
      .limit(1);

    return result[0] || null;
  }

  async findAnyActiveDosen() {
    const result = await this.db
      .select({
        id: users.id,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .innerJoin(dosen, eq(users.id, dosen.id))
      .where(
        and(
          eq(users.role, 'DOSEN'),
          eq(users.isActive, true),
          not(ilike(dosen.jabatan, '%wakil dekan%'))
        )
      )
      .limit(1);

    return result[0] || null;
  }

  async createDosen(data: typeof dosen.$inferInsert) {
    const result = await this.db.insert(dosen).values(data).returning();
    return result[0];
  }

  async updateDosenByUserId(userId: string, data: Partial<typeof dosen.$inferInsert>) {
    const result = await this.db
      .update(dosen)
      .set(data)
      .where(eq(dosen.id, userId))
      .returning();
    return result[0] || null;
  }

  async getDosenMe(userId: string) {
    const result = await this.db
      .select({
        id: users.id,
        nama: users.nama,
        email: users.email,
        role: users.role,
        phone: users.phone,
        nip: dosen.nip,
        jabatan: dosen.jabatan,
        fakultas: dosen.fakultas,
        prodi: dosen.prodi,
        esignatureUrl: dosen.esignatureUrl,
        esignatureKey: dosen.esignatureKey,
        esignatureUploadedAt: dosen.esignatureUploadedAt,
      })
      .from(users)
      .innerJoin(dosen, eq(users.id, dosen.id))
      .where(eq(users.id, userId))
      .limit(1);

    return result[0] || null;
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

  // Find mahasiswa user by NIM (joins users + mahasiswa)
  async findByNim(nim: string) {
    const result = await this.db
      .select({
        id: users.id,
        nama: users.nama,
        email: users.email,
        role: users.role,
        phone: users.phone,
        isActive: users.isActive,
        nim: mahasiswa.nim,
        prodi: mahasiswa.prodi,
        fakultas: mahasiswa.fakultas,
        semester: mahasiswa.semester,
        jumlahSksSelesai: mahasiswa.jumlahSksSelesai,
        angkatan: mahasiswa.angkatan,
      })
      .from(users)
      .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
      .where(eq(mahasiswa.nim, nim))
      .limit(1);

    return result[0] || null;
  }

  // Search mahasiswa by nama, nim, or email
  async searchMahasiswa(query: string) {
    const searchPattern = `%${query}%`;
    
    const result = await this.db
      .select({
        id: users.id,
        name: users.nama,
        nim: mahasiswa.nim,
        email: users.email,
        prodi: mahasiswa.prodi,
        fakultas: mahasiswa.fakultas,
      })
      .from(users)
      .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
      .where(
        or(
          ilike(users.nama, searchPattern),
          ilike(mahasiswa.nim, searchPattern),
          ilike(users.email, searchPattern)
        )
      )
      .orderBy(users.nama, mahasiswa.nim)
      .limit(50);
    
    return result;
  }
}
