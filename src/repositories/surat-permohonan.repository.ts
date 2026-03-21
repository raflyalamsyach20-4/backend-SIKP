import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { suratPermohonanRequests, users, mahasiswa, dosen, submissions } from '@/db/schema';

export class SuratPermohonanRepository {
  constructor(private db: DbClient) {}

  private isMissingSnapshotColumnError(error: unknown) {
    return error instanceof Error && /mahasiswa_esignature_(url|snapshot_at)/i.test(error.message);
  }

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
    try {
      const result = await this.db
        .select({
          id: suratPermohonanRequests.id,
          memberUserId: suratPermohonanRequests.memberUserId,
          dosenUserId: suratPermohonanRequests.dosenUserId,
          submissionId: suratPermohonanRequests.submissionId,
          status: suratPermohonanRequests.status,
          mahasiswaEsignatureUrl: suratPermohonanRequests.mahasiswaEsignatureUrl,
          mahasiswaEsignatureSnapshotAt: suratPermohonanRequests.mahasiswaEsignatureSnapshotAt,
          signedFileUrl: suratPermohonanRequests.signedFileUrl,
          signedFileKey: suratPermohonanRequests.signedFileKey,
          requestedAt: suratPermohonanRequests.requestedAt,
          approvedAt: suratPermohonanRequests.approvedAt,
          approvedBy: suratPermohonanRequests.approvedBy,
          createdAt: suratPermohonanRequests.createdAt,
          mahasiswaNama: users.nama,
          mahasiswaNim: mahasiswa.nim,
          mahasiswaProdi: mahasiswa.prodi,
          mahasiswaAngkatan: mahasiswa.angkatan,
          mahasiswaSemester: mahasiswa.semester,
          mahasiswaJumlahSksSelesai: mahasiswa.jumlahSksSelesai,
          mahasiswaEmail: users.email,
          mahasiswaPhone: users.phone,
          dosenNama: sql<string | null>`(
            select u_dosen.nama
            from users u_dosen
            where u_dosen.id = ${suratPermohonanRequests.dosenUserId}
            limit 1
          )`,
          dosenNip: dosen.nip,
          dosenJabatan: dosen.jabatan,
          dosenEsignatureUrl: dosen.esignatureUrl,
          companyName: submissions.companyName,
          companyAddress: submissions.companyAddress,
          companyPhone: submissions.companyPhone,
          companyBusinessType: submissions.companyBusinessType,
          division: submissions.division,
          startDate: submissions.startDate,
          endDate: submissions.endDate,
        })
        .from(suratPermohonanRequests)
        .innerJoin(users, eq(suratPermohonanRequests.memberUserId, users.id))
        .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
        .innerJoin(submissions, eq(suratPermohonanRequests.submissionId, submissions.id))
        .leftJoin(dosen, eq(suratPermohonanRequests.dosenUserId, dosen.id))
        .where(eq(suratPermohonanRequests.id, id))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      if (!this.isMissingSnapshotColumnError(error)) {
        throw error;
      }

      const result = await this.db
        .select({
          id: suratPermohonanRequests.id,
          memberUserId: suratPermohonanRequests.memberUserId,
          dosenUserId: suratPermohonanRequests.dosenUserId,
          submissionId: suratPermohonanRequests.submissionId,
          status: suratPermohonanRequests.status,
          mahasiswaEsignatureUrl: mahasiswa.esignatureUrl,
          mahasiswaEsignatureSnapshotAt: sql<Date | null>`null`,
          signedFileUrl: suratPermohonanRequests.signedFileUrl,
          signedFileKey: suratPermohonanRequests.signedFileKey,
          requestedAt: suratPermohonanRequests.requestedAt,
          approvedAt: suratPermohonanRequests.approvedAt,
          approvedBy: suratPermohonanRequests.approvedBy,
          createdAt: suratPermohonanRequests.createdAt,
          mahasiswaNama: users.nama,
          mahasiswaNim: mahasiswa.nim,
          mahasiswaProdi: mahasiswa.prodi,
          mahasiswaAngkatan: mahasiswa.angkatan,
          mahasiswaSemester: mahasiswa.semester,
          mahasiswaJumlahSksSelesai: mahasiswa.jumlahSksSelesai,
          mahasiswaEmail: users.email,
          mahasiswaPhone: users.phone,
          dosenNama: sql<string | null>`(
            select u_dosen.nama
            from users u_dosen
            where u_dosen.id = ${suratPermohonanRequests.dosenUserId}
            limit 1
          )`,
          dosenNip: dosen.nip,
          dosenJabatan: dosen.jabatan,
          dosenEsignatureUrl: dosen.esignatureUrl,
          companyName: submissions.companyName,
          companyAddress: submissions.companyAddress,
          companyPhone: submissions.companyPhone,
          companyBusinessType: submissions.companyBusinessType,
          division: submissions.division,
          startDate: submissions.startDate,
          endDate: submissions.endDate,
        })
        .from(suratPermohonanRequests)
        .innerJoin(users, eq(suratPermohonanRequests.memberUserId, users.id))
        .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
        .innerJoin(submissions, eq(suratPermohonanRequests.submissionId, submissions.id))
        .leftJoin(dosen, eq(suratPermohonanRequests.dosenUserId, dosen.id))
        .where(eq(suratPermohonanRequests.id, id))
        .limit(1);

      return result[0] || null;
    }
  }

  async findByDosenIdWithDetails(dosenUserId: string) {
    try {
      return await this.db
        .select({
          id: suratPermohonanRequests.id,
          tanggal: suratPermohonanRequests.requestedAt,
          nim: mahasiswa.nim,
          namaMahasiswa: users.nama,
          programStudi: mahasiswa.prodi,
          angkatan: mahasiswa.angkatan,
          semester: mahasiswa.semester,
          jumlahSks: mahasiswa.jumlahSksSelesai,
          email: users.email,
          noHp: users.phone,
          jenisSurat: sql<string>`'Surat Permohonan'`,
          status: suratPermohonanRequests.status,
          mahasiswaEsignatureUrl: suratPermohonanRequests.mahasiswaEsignatureUrl,
          mahasiswaEsignatureSnapshotAt: suratPermohonanRequests.mahasiswaEsignatureSnapshotAt,
          signedFileUrl: suratPermohonanRequests.signedFileUrl,
          approvedAt: suratPermohonanRequests.approvedAt,
          rejectedAt: suratPermohonanRequests.approvedAt,
          rejectionReason: suratPermohonanRequests.rejectionReason,
          dosenNama: sql<string | null>`(
            select u_dosen.nama
            from users u_dosen
            where u_dosen.id = ${suratPermohonanRequests.dosenUserId}
            limit 1
          )`,
          dosenNip: dosen.nip,
          dosenJabatan: dosen.jabatan,
          dosenEsignatureUrl: dosen.esignatureUrl,
          namaPerusahaan: submissions.companyName,
          alamatPerusahaan: submissions.companyAddress,
          teleponPerusahaan: submissions.companyPhone,
          jenisProdukUsaha: submissions.companyBusinessType,
          divisi: submissions.division,
          tanggalMulai: submissions.startDate,
          tanggalSelesai: submissions.endDate,
        })
        .from(suratPermohonanRequests)
        .innerJoin(users, eq(suratPermohonanRequests.memberUserId, users.id))
        .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
        .innerJoin(submissions, eq(suratPermohonanRequests.submissionId, submissions.id))
        .innerJoin(dosen, eq(suratPermohonanRequests.dosenUserId, dosen.id))
        .where(eq(suratPermohonanRequests.dosenUserId, dosenUserId))
        .orderBy(desc(suratPermohonanRequests.requestedAt));
    } catch (error) {
      if (!this.isMissingSnapshotColumnError(error)) {
        throw error;
      }

      return await this.db
        .select({
          id: suratPermohonanRequests.id,
          tanggal: suratPermohonanRequests.requestedAt,
          nim: mahasiswa.nim,
          namaMahasiswa: users.nama,
          programStudi: mahasiswa.prodi,
          angkatan: mahasiswa.angkatan,
          semester: mahasiswa.semester,
          jumlahSks: mahasiswa.jumlahSksSelesai,
          email: users.email,
          noHp: users.phone,
          jenisSurat: sql<string>`'Surat Permohonan'`,
          status: suratPermohonanRequests.status,
          mahasiswaEsignatureUrl: mahasiswa.esignatureUrl,
          mahasiswaEsignatureSnapshotAt: sql<Date | null>`null`,
          signedFileUrl: suratPermohonanRequests.signedFileUrl,
          approvedAt: suratPermohonanRequests.approvedAt,
          rejectedAt: suratPermohonanRequests.approvedAt,
          rejectionReason: suratPermohonanRequests.rejectionReason,
          dosenNama: sql<string | null>`(
            select u_dosen.nama
            from users u_dosen
            where u_dosen.id = ${suratPermohonanRequests.dosenUserId}
            limit 1
          )`,
          dosenNip: dosen.nip,
          dosenJabatan: dosen.jabatan,
          dosenEsignatureUrl: dosen.esignatureUrl,
          namaPerusahaan: submissions.companyName,
          alamatPerusahaan: submissions.companyAddress,
          teleponPerusahaan: submissions.companyPhone,
          jenisProdukUsaha: submissions.companyBusinessType,
          divisi: submissions.division,
          tanggalMulai: submissions.startDate,
          tanggalSelesai: submissions.endDate,
        })
        .from(suratPermohonanRequests)
        .innerJoin(users, eq(suratPermohonanRequests.memberUserId, users.id))
        .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
        .innerJoin(submissions, eq(suratPermohonanRequests.submissionId, submissions.id))
        .innerJoin(dosen, eq(suratPermohonanRequests.dosenUserId, dosen.id))
        .where(eq(suratPermohonanRequests.dosenUserId, dosenUserId))
        .orderBy(desc(suratPermohonanRequests.requestedAt));
    }
  }

  async findAllWithDetails() {
    try {
      return await this.db
        .select({
          id: suratPermohonanRequests.id,
          tanggal: suratPermohonanRequests.requestedAt,
          nim: mahasiswa.nim,
          namaMahasiswa: users.nama,
          programStudi: mahasiswa.prodi,
          angkatan: mahasiswa.angkatan,
          semester: mahasiswa.semester,
          jumlahSks: mahasiswa.jumlahSksSelesai,
          email: users.email,
          noHp: users.phone,
          jenisSurat: sql<string>`'Surat Permohonan'`,
          status: suratPermohonanRequests.status,
          mahasiswaEsignatureUrl: suratPermohonanRequests.mahasiswaEsignatureUrl,
          mahasiswaEsignatureSnapshotAt: suratPermohonanRequests.mahasiswaEsignatureSnapshotAt,
          signedFileUrl: suratPermohonanRequests.signedFileUrl,
          approvedAt: suratPermohonanRequests.approvedAt,
          rejectedAt: suratPermohonanRequests.approvedAt,
          rejectionReason: suratPermohonanRequests.rejectionReason,
          dosenNama: sql<string | null>`(
            select u_dosen.nama
            from users u_dosen
            where u_dosen.id = ${suratPermohonanRequests.dosenUserId}
            limit 1
          )`,
          dosenNip: dosen.nip,
          dosenJabatan: dosen.jabatan,
          dosenEsignatureUrl: dosen.esignatureUrl,
          namaPerusahaan: submissions.companyName,
          alamatPerusahaan: submissions.companyAddress,
          teleponPerusahaan: submissions.companyPhone,
          jenisProdukUsaha: submissions.companyBusinessType,
          divisi: submissions.division,
          tanggalMulai: submissions.startDate,
          tanggalSelesai: submissions.endDate,
        })
        .from(suratPermohonanRequests)
        .innerJoin(users, eq(suratPermohonanRequests.memberUserId, users.id))
        .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
        .innerJoin(submissions, eq(suratPermohonanRequests.submissionId, submissions.id))
        .innerJoin(dosen, eq(suratPermohonanRequests.dosenUserId, dosen.id))
        .orderBy(desc(suratPermohonanRequests.requestedAt));
    } catch (error) {
      if (!this.isMissingSnapshotColumnError(error)) {
        throw error;
      }

      return await this.db
        .select({
          id: suratPermohonanRequests.id,
          tanggal: suratPermohonanRequests.requestedAt,
          nim: mahasiswa.nim,
          namaMahasiswa: users.nama,
          programStudi: mahasiswa.prodi,
          angkatan: mahasiswa.angkatan,
          semester: mahasiswa.semester,
          jumlahSks: mahasiswa.jumlahSksSelesai,
          email: users.email,
          noHp: users.phone,
          jenisSurat: sql<string>`'Surat Permohonan'`,
          status: suratPermohonanRequests.status,
          mahasiswaEsignatureUrl: mahasiswa.esignatureUrl,
          mahasiswaEsignatureSnapshotAt: sql<Date | null>`null`,
          signedFileUrl: suratPermohonanRequests.signedFileUrl,
          approvedAt: suratPermohonanRequests.approvedAt,
          rejectedAt: suratPermohonanRequests.approvedAt,
          rejectionReason: suratPermohonanRequests.rejectionReason,
          dosenNama: sql<string | null>`(
            select u_dosen.nama
            from users u_dosen
            where u_dosen.id = ${suratPermohonanRequests.dosenUserId}
            limit 1
          )`,
          dosenNip: dosen.nip,
          dosenJabatan: dosen.jabatan,
          dosenEsignatureUrl: dosen.esignatureUrl,
          namaPerusahaan: submissions.companyName,
          alamatPerusahaan: submissions.companyAddress,
          teleponPerusahaan: submissions.companyPhone,
          jenisProdukUsaha: submissions.companyBusinessType,
          divisi: submissions.division,
          tanggalMulai: submissions.startDate,
          tanggalSelesai: submissions.endDate,
        })
        .from(suratPermohonanRequests)
        .innerJoin(users, eq(suratPermohonanRequests.memberUserId, users.id))
        .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
        .innerJoin(submissions, eq(suratPermohonanRequests.submissionId, submissions.id))
        .innerJoin(dosen, eq(suratPermohonanRequests.dosenUserId, dosen.id))
        .orderBy(desc(suratPermohonanRequests.requestedAt));
    }
  }

  async findExistingPending(memberUserId: string, dosenUserId: string) {
    const result = await this.db
      .select({
        id: suratPermohonanRequests.id,
      })
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

  async create(data: typeof suratPermohonanRequests.$inferInsert) {
    try {
      const result = await this.db
        .insert(suratPermohonanRequests)
        .values(data)
        .returning(this.getBaseSelection());

      return result[0];
    } catch (error) {
      if (!this.isMissingSnapshotColumnError(error)) {
        throw error;
      }

      const { mahasiswaEsignatureUrl: _url, mahasiswaEsignatureSnapshotAt: _snapshotAt, ...legacyData } = data;
      const result = await this.db
        .insert(suratPermohonanRequests)
        .values(legacyData)
        .returning(this.getBaseSelection());

      return result[0];
    }
  }

  async update(id: string, data: Partial<typeof suratPermohonanRequests.$inferInsert>) {
    const result = await this.db
      .update(suratPermohonanRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(suratPermohonanRequests.id, id))
      .returning(this.getBaseSelection());

    return result[0] || null;
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
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(suratPermohonanRequests.id, id),
          eq(suratPermohonanRequests.dosenUserId, dosenUserId),
          eq(suratPermohonanRequests.status, 'MENUNGGU')
        )
      )
      .returning(this.getBaseSelection());

    return result[0] || null;
  }

  async rejectPending(id: string, dosenUserId: string, reason: string) {
    const rejectedAt = new Date();

    const result = await this.db
      .update(suratPermohonanRequests)
      .set({
        status: 'DITOLAK',
        approvedAt: rejectedAt,
        approvedBy: dosenUserId,
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
      .returning(this.getBaseSelection());

    return result[0] || null;
  }

  async reapplyRejected(
    id: string,
    memberUserId: string,
    data: {
      mahasiswaEsignatureUrl: string;
      mahasiswaEsignatureSnapshotAt: Date;
    }
  ) {
    try {
      const result = await this.db
        .update(suratPermohonanRequests)
        .set({
          status: 'MENUNGGU',
          approvedAt: null,
          approvedBy: null,
          rejectionReason: null,
          signedFileUrl: null,
          signedFileKey: null,
          mahasiswaEsignatureUrl: data.mahasiswaEsignatureUrl,
          mahasiswaEsignatureSnapshotAt: data.mahasiswaEsignatureSnapshotAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(suratPermohonanRequests.id, id),
            eq(suratPermohonanRequests.memberUserId, memberUserId),
            sql`${suratPermohonanRequests.status}::text in ('DITOLAK', 'REJECTED')`
          )
        )
        .returning(this.getBaseSelection());

      return result[0] || null;
    } catch (error) {
      if (!this.isMissingSnapshotColumnError(error)) {
        throw error;
      }

      const result = await this.db
        .update(suratPermohonanRequests)
        .set({
          status: 'MENUNGGU',
          approvedAt: null,
          approvedBy: null,
          rejectionReason: null,
          signedFileUrl: null,
          signedFileKey: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(suratPermohonanRequests.id, id),
            eq(suratPermohonanRequests.memberUserId, memberUserId),
            sql`${suratPermohonanRequests.status}::text in ('DITOLAK', 'REJECTED')`
          )
        )
        .returning(this.getBaseSelection());

      return result[0] || null;
    }
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

    const baseCondition = inArray(suratPermohonanRequests.memberUserId, memberUserIds);
    const whereCondition = submissionId
      ? and(baseCondition, eq(suratPermohonanRequests.submissionId, submissionId))
      : baseCondition;

    return await this.db
      .select({
        id: suratPermohonanRequests.id,
        memberUserId: suratPermohonanRequests.memberUserId,
        status: suratPermohonanRequests.status,
        dosenName: sql<string | null>`(
          select u_dosen.nama
          from users u_dosen
          where u_dosen.id = ${suratPermohonanRequests.dosenUserId}
          limit 1
        )`,
        signedFileUrl: suratPermohonanRequests.signedFileUrl,
        rejectionReason: suratPermohonanRequests.rejectionReason,
        submittedAt: suratPermohonanRequests.requestedAt,
      })
      .from(suratPermohonanRequests)
      .where(whereCondition)
      .orderBy(desc(suratPermohonanRequests.requestedAt));
  }
}
