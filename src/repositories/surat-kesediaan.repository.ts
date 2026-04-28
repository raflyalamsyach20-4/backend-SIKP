import { eq, desc, inArray, and, sql } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { suratKesediaanRequests } from '@/db/schema';

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
        memberMahasiswaId: suratKesediaanRequests.memberMahasiswaId,
        dosenId: suratKesediaanRequests.dosenId,
        status: suratKesediaanRequests.status,
        createdAt: suratKesediaanRequests.createdAt,
        approvedAt: suratKesediaanRequests.approvedAt,
        approvedByDosenId: suratKesediaanRequests.approvedByDosenId,
        signedFileUrl: suratKesediaanRequests.signedFileUrl,
        signedFileKey: suratKesediaanRequests.signedFileKey,
        mahasiswaNama: sql<string | null>`null`,
        mahasiswaNim: sql<string | null>`null`,
        mahasiswaProdi: sql<string | null>`null`,
        mahasiswaAngkatan: sql<number | null>`null`,
        mahasiswaSemester: sql<number | null>`null`,
        mahasiswaEmail: sql<string | null>`null`,
        mahasiswaPhone: sql<string | null>`null`,
        dosenNama: suratKesediaanRequests.dosenId,
        dosenNip: sql<string | null>`null`,
        dosenJabatan: sql<string | null>`null`,
        dosenEsignatureUrl: sql<string | null>`null`,
      })
      .from(suratKesediaanRequests)
      .where(eq(suratKesediaanRequests.id, id))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Find requests for a dosen with member and submission data
   */
  async findByDosenIdWithDetails(dosenId: string) {
    const result = await this.db
      .select({
        id: suratKesediaanRequests.id,
        tanggal: suratKesediaanRequests.createdAt,
        nim: sql<string | null>`null`,
        namaMahasiswa: suratKesediaanRequests.memberMahasiswaId,
        programStudi: sql<string | null>`null`,
        angkatan: sql<number | null>`null`,
        semester: sql<number | null>`null`,
        email: sql<string | null>`null`,
        noHp: sql<string | null>`null`,
        jenisSurat: sql<string>`'Surat Kesediaan'`,
        status: suratKesediaanRequests.status,
        approvedAt: suratKesediaanRequests.approvedAt,
        signedFileUrl: suratKesediaanRequests.signedFileUrl,
        rejectionReason: suratKesediaanRequests.rejectionReason,
        dosenNip: sql<string | null>`null`,
        dosenJabatan: sql<string | null>`null`,
        dosenEsignatureUrl: sql<string | null>`null`,
      })
      .from(suratKesediaanRequests)
      .where(eq(suratKesediaanRequests.dosenId, dosenId))
      .orderBy(desc(suratKesediaanRequests.createdAt));

    return result;
  }

  async findAllWithDetails() {
    return await this.db
      .select({
        id: suratKesediaanRequests.id,
        tanggal: suratKesediaanRequests.createdAt,
        nim: sql<string | null>`null`,
        namaMahasiswa: suratKesediaanRequests.memberMahasiswaId,
        programStudi: sql<string | null>`null`,
        angkatan: sql<number | null>`null`,
        semester: sql<number | null>`null`,
        email: sql<string | null>`null`,
        noHp: sql<string | null>`null`,
        jenisSurat: sql<string>`'Surat Kesediaan'`,
        status: suratKesediaanRequests.status,
        approvedAt: suratKesediaanRequests.approvedAt,
        signedFileUrl: suratKesediaanRequests.signedFileUrl,
        rejectionReason: suratKesediaanRequests.rejectionReason,
        dosenNip: sql<string | null>`null`,
        dosenJabatan: sql<string | null>`null`,
        dosenEsignatureUrl: sql<string | null>`null`,
      })
      .from(suratKesediaanRequests)
      .orderBy(desc(suratKesediaanRequests.createdAt));
  }

  /**
   * Check if request already exists with status MENUNGGU
   */
  async findExistingPending(memberMahasiswaId: string, dosenId: string) {
    const result = await this.db
      .select()
      .from(suratKesediaanRequests)
      .where(
        and(
          eq(suratKesediaanRequests.memberMahasiswaId, memberMahasiswaId),
          eq(suratKesediaanRequests.dosenId, dosenId),
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
    dosenId: string,
    data: {
      approvedByDosenId: string;
      approvedAt: Date;
      signedFileUrl: string;
      signedFileKey: string;
    }
  ) {
    const result = await this.db
      .update(suratKesediaanRequests)
      .set({
        status: 'DISETUJUI',
        approvedByDosenId: data.approvedByDosenId,
        approvedAt: data.approvedAt,
        signedFileUrl: data.signedFileUrl,
        signedFileKey: data.signedFileKey,
      })
      .where(
        and(
          eq(suratKesediaanRequests.id, id),
          eq(suratKesediaanRequests.dosenId, dosenId),
          eq(suratKesediaanRequests.status, 'MENUNGGU')
        )
      )
      .returning();

    return result[0] || null;
  }

  async rejectPending(id: string, dosenId: string, reason: string) {
    const result = await this.db
      .update(suratKesediaanRequests)
      .set({
        status: 'DITOLAK',
        approvedByDosenId: dosenId,
        approvedAt: new Date(),
        rejectionReason: reason,
      })
      .where(
        and(
          eq(suratKesediaanRequests.id, id),
          eq(suratKesediaanRequests.dosenId, dosenId),
          eq(suratKesediaanRequests.status, 'MENUNGGU')
        )
      )
      .returning();

    return result[0] || null;
  }

  async reapplyRejected(id: string, memberMahasiswaId: string) {
    const result = await this.db
      .update(suratKesediaanRequests)
      .set({
        status: 'MENUNGGU',
        rejectionReason: null,
        approvedAt: null,
        approvedByDosenId: null,
        signedFileUrl: null,
        signedFileKey: null,
      })
      .where(
        and(
          eq(suratKesediaanRequests.id, id),
          eq(suratKesediaanRequests.memberMahasiswaId, memberMahasiswaId),
          sql`${suratKesediaanRequests.status}::text in ('DITOLAK', 'REJECTED')`
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

  async findLatestByMahasiswaId(memberMahasiswaId: string) {
    const result = await this.db
      .select()
      .from(suratKesediaanRequests)
      .where(eq(suratKesediaanRequests.memberMahasiswaId, memberMahasiswaId))
      .orderBy(desc(suratKesediaanRequests.createdAt))
      .limit(1);

    return result[0] || null;
  }

  async findLatestByMahasiswaIds(memberMahasiswaIds: string[]) {
    if (memberMahasiswaIds.length === 0) return [];

    return await this.db
      .select({
        id: suratKesediaanRequests.id,
        memberMahasiswaId: suratKesediaanRequests.memberMahasiswaId,
        status: suratKesediaanRequests.status,
        dosenName: suratKesediaanRequests.dosenId,
        signedFileUrl: suratKesediaanRequests.signedFileUrl,
        rejectionReason: suratKesediaanRequests.rejectionReason,
        submittedAt: suratKesediaanRequests.createdAt,
      })
      .from(suratKesediaanRequests)
      .where(inArray(suratKesediaanRequests.memberMahasiswaId, memberMahasiswaIds))
      .orderBy(desc(suratKesediaanRequests.createdAt));
  }
}
