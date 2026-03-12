import { eq, desc, inArray, and, sql } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { suratKesediaanRequests, users, mahasiswa, dosen } from '@/db/schema';

export class SuratKesediaanRepository {
  constructor(private db: DbClient) {}

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(suratKesediaanRequests)
      .where(eq(suratKesediaanRequests.id, id))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Find request by ID with all related data for detail view
   */
  async findByIdWithDetails(id: string) {
    const result = await this.db
      .select({
        id: suratKesediaanRequests.id,
        memberUserId: suratKesediaanRequests.memberUserId,
        dosenUserId: suratKesediaanRequests.dosenUserId,
        status: suratKesediaanRequests.status,
        createdAt: suratKesediaanRequests.createdAt,
        approvedAt: suratKesediaanRequests.approvedAt,
        approvedBy: suratKesediaanRequests.approvedBy,
        signedFileUrl: suratKesediaanRequests.signedFileUrl,
        signedFileKey: suratKesediaanRequests.signedFileKey,
        mahasiswaNama: users.nama,
        mahasiswaNim: mahasiswa.nim,
        mahasiswaProdi: mahasiswa.prodi,
        mahasiswaAngkatan: mahasiswa.angkatan,
        mahasiswaSemester: mahasiswa.semester,
        mahasiswaEmail: users.email,
        mahasiswaPhone: users.phone,
        dosenNama: sql<string | null>`(
          select u_dosen.nama
          from users u_dosen
          where u_dosen.id = ${suratKesediaanRequests.dosenUserId}
          limit 1
        )`,
        dosenNip: dosen.nip,
        dosenJabatan: dosen.jabatan,
        dosenEsignatureUrl: dosen.esignatureUrl,
      })
      .from(suratKesediaanRequests)
      .innerJoin(users, eq(suratKesediaanRequests.memberUserId, users.id))
      .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
      .leftJoin(dosen, eq(suratKesediaanRequests.dosenUserId, dosen.id))
      .where(eq(suratKesediaanRequests.id, id))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Find requests for a dosen with member and submission data
   */
  async findByDosenIdWithDetails(dosenUserId: string) {
    const result = await this.db
      .select({
        id: suratKesediaanRequests.id,
        tanggal: suratKesediaanRequests.createdAt,
        nim: mahasiswa.nim,
        namaMahasiswa: users.nama,
        programStudi: mahasiswa.prodi,
        angkatan: mahasiswa.angkatan,
        semester: mahasiswa.semester,
        email: users.email,
        noHp: users.phone,
        jenisSurat: sql<string>`'Surat Kesediaan'`,
        status: suratKesediaanRequests.status,
        approvedAt: suratKesediaanRequests.approvedAt,
        signedFileUrl: suratKesediaanRequests.signedFileUrl,
        dosenNip: dosen.nip,
        dosenJabatan: dosen.jabatan,
        dosenEsignatureUrl: dosen.esignatureUrl,
      })
      .from(suratKesediaanRequests)
      .innerJoin(users, eq(suratKesediaanRequests.memberUserId, users.id))
      .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
      .innerJoin(dosen, eq(suratKesediaanRequests.dosenUserId, dosen.id))
      .where(eq(suratKesediaanRequests.dosenUserId, dosenUserId))
      .orderBy(desc(suratKesediaanRequests.createdAt));

    return result;
  }

  /**
   * Check if request already exists with status MENUNGGU
   */
  async findExistingPending(memberUserId: string, dosenUserId: string) {
    const result = await this.db
      .select()
      .from(suratKesediaanRequests)
      .where(
        and(
          eq(suratKesediaanRequests.memberUserId, memberUserId),
          eq(suratKesediaanRequests.dosenUserId, dosenUserId),
          eq(suratKesediaanRequests.status, 'MENUNGGU')
        )
      )
      .limit(1);

    return result[0] || null;
  }

  async create(data: typeof suratKesediaanRequests.$inferInsert) {
    const result = await this.db
      .insert(suratKesediaanRequests)
      .values(data)
      .returning();
    return result[0];
  }

  async update(id: string, data: Partial<typeof suratKesediaanRequests.$inferInsert>) {
    const result = await this.db
      .update(suratKesediaanRequests)
      .set(data)
      .where(eq(suratKesediaanRequests.id, id))
      .returning();
    return result[0];
  }

  async approveWithSignedFile(
    id: string,
    dosenUserId: string,
    data: {
      approvedBy: string;
      approvedAt: Date;
      signedFileUrl: string;
      signedFileKey: string;
    }
  ) {
    const result = await this.db
      .update(suratKesediaanRequests)
      .set({
        status: 'DISETUJUI',
        approvedBy: data.approvedBy,
        approvedAt: data.approvedAt,
        signedFileUrl: data.signedFileUrl,
        signedFileKey: data.signedFileKey,
      })
      .where(
        and(
          eq(suratKesediaanRequests.id, id),
          eq(suratKesediaanRequests.dosenUserId, dosenUserId),
          eq(suratKesediaanRequests.status, 'MENUNGGU')
        )
      )
      .returning();

    return result[0] || null;
  }

  async updateBulk(ids: string[], data: Partial<typeof suratKesediaanRequests.$inferInsert>) {
    const result = await this.db
      .update(suratKesediaanRequests)
      .set(data)
      .where(inArray(suratKesediaanRequests.id, ids))
      .returning();
    return result;
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return await this.db
      .select()
      .from(suratKesediaanRequests)
      .where(inArray(suratKesediaanRequests.id, ids));
  }

  async findLatestByMember(memberUserId: string) {
    const result = await this.db
      .select()
      .from(suratKesediaanRequests)
      .where(eq(suratKesediaanRequests.memberUserId, memberUserId))
      .orderBy(desc(suratKesediaanRequests.createdAt))
      .limit(1);

    return result[0] || null;
  }
}
