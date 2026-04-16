import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { suratPermohonanRequests, submissions } from '@/db/schema';

type SuratPermohonanCreateInput = typeof suratPermohonanRequests.$inferInsert & {
  mahasiswaEsignatureUrl?: string | null;
  mahasiswaEsignatureSnapshotAt?: Date | null;
};

type SuratPermohonanUpdateInput = Partial<typeof suratPermohonanRequests.$inferInsert> & {
  mahasiswaEsignatureUrl?: string | null;
  mahasiswaEsignatureSnapshotAt?: Date | null;
};

export class SuratPermohonanRepository {
  constructor(private db: DbClient) {}

  private getBaseSelection() {
    return {
      id: suratPermohonanRequests.id,
      memberUserId: suratPermohonanRequests.memberUserId,
      dosenUserId: suratPermohonanRequests.dosenUserId,
      submissionId: suratPermohonanRequests.submissionId,
      status: suratPermohonanRequests.status,
      signedFileUrl: suratPermohonanRequests.signedFileUrl,
      signedFileKey: suratPermohonanRequests.signedFileKey,
      requestedAt: suratPermohonanRequests.requestedAt,
      approvedAt: suratPermohonanRequests.approvedAt,
      approvedBy: suratPermohonanRequests.approvedBy,
      rejectionReason: suratPermohonanRequests.rejectionReason,
      createdAt: suratPermohonanRequests.createdAt,
      updatedAt: suratPermohonanRequests.updatedAt,
    };
  }

  async findById(id: string) {
    const result = await this.db
      .select(this.getBaseSelection())
      .from(suratPermohonanRequests)
      .where(eq(suratPermohonanRequests.id, id))
      .limit(1);

    return result[0] || null;
  }

  async findByIdWithDetails(id: string) {
    const result = await this.db
      .select({
        ...this.getBaseSelection(),
        mahasiswaEsignatureUrl: sql<string | null>`null`,
        mahasiswaEsignatureSnapshotAt: sql<Date | null>`null`,
        mahasiswaNama: suratPermohonanRequests.memberUserId,
        mahasiswaNim: sql<string | null>`null`,
        mahasiswaProdi: sql<string | null>`null`,
        mahasiswaAngkatan: sql<number | null>`null`,
        mahasiswaSemester: sql<number | null>`null`,
        mahasiswaJumlahSksSelesai: sql<number | null>`null`,
        mahasiswaEmail: sql<string | null>`null`,
        mahasiswaPhone: sql<string | null>`null`,
        dosenNama: suratPermohonanRequests.dosenUserId,
        dosenNip: sql<string | null>`null`,
        dosenJabatan: sql<string | null>`null`,
        dosenEsignatureUrl: sql<string | null>`null`,
        companyName: submissions.companyName,
        companyAddress: submissions.companyAddress,
        companyPhone: submissions.companyPhone,
        companyBusinessType: submissions.companyBusinessType,
        division: submissions.division,
        startDate: submissions.startDate,
        endDate: submissions.endDate,
      })
      .from(suratPermohonanRequests)
      .innerJoin(submissions, eq(suratPermohonanRequests.submissionId, submissions.id))
      .where(eq(suratPermohonanRequests.id, id))
      .limit(1);

    return result[0] || null;
  }

  async findByDosenIdWithDetails(dosenUserId: string) {
    return await this.db
      .select({
        id: suratPermohonanRequests.id,
        tanggal: suratPermohonanRequests.requestedAt,
        nim: sql<string | null>`null`,
        namaMahasiswa: suratPermohonanRequests.memberUserId,
        programStudi: sql<string | null>`null`,
        angkatan: sql<number | null>`null`,
        semester: sql<number | null>`null`,
        jumlahSks: sql<number | null>`null`,
        email: sql<string | null>`null`,
        noHp: sql<string | null>`null`,
        jenisSurat: sql<string>`'Surat Permohonan'`,
        status: suratPermohonanRequests.status,
        mahasiswaEsignatureUrl: sql<string | null>`null`,
        mahasiswaEsignatureSnapshotAt: sql<Date | null>`null`,
        signedFileUrl: suratPermohonanRequests.signedFileUrl,
        approvedAt: suratPermohonanRequests.approvedAt,
        rejectedAt: suratPermohonanRequests.approvedAt,
        rejectionReason: suratPermohonanRequests.rejectionReason,
        dosenNama: suratPermohonanRequests.dosenUserId,
        dosenNip: sql<string | null>`null`,
        dosenJabatan: sql<string | null>`null`,
        dosenEsignatureUrl: sql<string | null>`null`,
        namaPerusahaan: submissions.companyName,
        alamatPerusahaan: submissions.companyAddress,
        teleponPerusahaan: submissions.companyPhone,
        jenisProdukUsaha: submissions.companyBusinessType,
        divisi: submissions.division,
        tanggalMulai: submissions.startDate,
        tanggalSelesai: submissions.endDate,
      })
      .from(suratPermohonanRequests)
      .innerJoin(submissions, eq(suratPermohonanRequests.submissionId, submissions.id))
      .where(eq(suratPermohonanRequests.dosenUserId, dosenUserId))
      .orderBy(desc(suratPermohonanRequests.requestedAt));
  }

  async findAllWithDetails() {
    return await this.db
      .select({
        id: suratPermohonanRequests.id,
        tanggal: suratPermohonanRequests.requestedAt,
        nim: sql<string | null>`null`,
        namaMahasiswa: suratPermohonanRequests.memberUserId,
        programStudi: sql<string | null>`null`,
        angkatan: sql<number | null>`null`,
        semester: sql<number | null>`null`,
        jumlahSks: sql<number | null>`null`,
        email: sql<string | null>`null`,
        noHp: sql<string | null>`null`,
        jenisSurat: sql<string>`'Surat Permohonan'`,
        status: suratPermohonanRequests.status,
        mahasiswaEsignatureUrl: sql<string | null>`null`,
        mahasiswaEsignatureSnapshotAt: sql<Date | null>`null`,
        signedFileUrl: suratPermohonanRequests.signedFileUrl,
        approvedAt: suratPermohonanRequests.approvedAt,
        rejectedAt: suratPermohonanRequests.approvedAt,
        rejectionReason: suratPermohonanRequests.rejectionReason,
        dosenNama: suratPermohonanRequests.dosenUserId,
        dosenNip: sql<string | null>`null`,
        dosenJabatan: sql<string | null>`null`,
        dosenEsignatureUrl: sql<string | null>`null`,
        namaPerusahaan: submissions.companyName,
        alamatPerusahaan: submissions.companyAddress,
        teleponPerusahaan: submissions.companyPhone,
        jenisProdukUsaha: submissions.companyBusinessType,
        divisi: submissions.division,
        tanggalMulai: submissions.startDate,
        tanggalSelesai: submissions.endDate,
      })
      .from(suratPermohonanRequests)
      .innerJoin(submissions, eq(suratPermohonanRequests.submissionId, submissions.id))
      .orderBy(desc(suratPermohonanRequests.requestedAt));
  }

  async findExistingPending(memberUserId: string, dosenUserId: string) {
    const result = await this.db
      .select(this.getBaseSelection())
      .from(suratPermohonanRequests)
      .where(
        and(
          eq(suratPermohonanRequests.memberUserId, memberUserId),
          eq(suratPermohonanRequests.dosenUserId, dosenUserId),
          eq(suratPermohonanRequests.status, 'MENUNGGU')
        )
      )
      .limit(1);

    return result[0] || null;
  }

  async create(data: SuratPermohonanCreateInput) {
    const {
      mahasiswaEsignatureUrl: _legacyEsign,
      mahasiswaEsignatureSnapshotAt: _legacySnapshot,
      ...insertData
    } = data;

    const result = await this.db.insert(suratPermohonanRequests).values(insertData).returning();
    return result[0];
  }

  async update(id: string, data: SuratPermohonanUpdateInput) {
    const {
      mahasiswaEsignatureUrl: _legacyEsign,
      mahasiswaEsignatureSnapshotAt: _legacySnapshot,
      ...updateData
    } = data;

    const result = await this.db
      .update(suratPermohonanRequests)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(suratPermohonanRequests.id, id))
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
      .update(suratPermohonanRequests)
      .set({
        status: 'DISETUJUI',
        approvedBy: data.approvedBy,
        approvedAt: data.approvedAt,
        signedFileUrl: data.signedFileUrl,
        signedFileKey: data.signedFileKey,
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(suratPermohonanRequests.id, id),
          eq(suratPermohonanRequests.dosenUserId, dosenUserId),
          eq(suratPermohonanRequests.status, 'MENUNGGU')
        )
      )
      .returning();

    return result[0] || null;
  }

  async rejectPending(id: string, dosenUserId: string, reason: string) {
    const result = await this.db
      .update(suratPermohonanRequests)
      .set({
        status: 'DITOLAK',
        approvedBy: dosenUserId,
        approvedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(suratPermohonanRequests.id, id),
          eq(suratPermohonanRequests.dosenUserId, dosenUserId),
          eq(suratPermohonanRequests.status, 'MENUNGGU')
        )
      )
      .returning();

    return result[0] || null;
  }

  async reapplyRejected(
    id: string,
    memberUserId: string,
    data?: {
      mahasiswaEsignatureUrl?: string | null;
      mahasiswaEsignatureSnapshotAt?: Date | null;
    }
  ) {
    const _legacyData = data;

    const result = await this.db
      .update(suratPermohonanRequests)
      .set({
        status: 'MENUNGGU',
        rejectionReason: null,
        approvedBy: null,
        approvedAt: null,
        signedFileUrl: null,
        signedFileKey: null,
        requestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(suratPermohonanRequests.id, id),
          eq(suratPermohonanRequests.memberUserId, memberUserId),
          sql`${suratPermohonanRequests.status}::text in ('DITOLAK', 'REJECTED')`
        )
      )
      .returning();

    return result[0] || null;
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];

    return await this.db
      .select(this.getBaseSelection())
      .from(suratPermohonanRequests)
      .where(inArray(suratPermohonanRequests.id, ids));
  }

  async findLatestByMemberIds(memberUserIds: string[], submissionId?: string) {
    if (memberUserIds.length === 0) return [];

    const conditions = [inArray(suratPermohonanRequests.memberUserId, memberUserIds)];
    if (submissionId) {
      conditions.push(eq(suratPermohonanRequests.submissionId, submissionId));
    }

    return await this.db
      .select({
        id: suratPermohonanRequests.id,
        memberUserId: suratPermohonanRequests.memberUserId,
        status: suratPermohonanRequests.status,
        dosenName: suratPermohonanRequests.dosenUserId,
        signedFileUrl: suratPermohonanRequests.signedFileUrl,
        rejectionReason: suratPermohonanRequests.rejectionReason,
        submittedAt: suratPermohonanRequests.requestedAt,
      })
      .from(suratPermohonanRequests)
      .where(and(...conditions))
      .orderBy(desc(suratPermohonanRequests.requestedAt));
  }
}
