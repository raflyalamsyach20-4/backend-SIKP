import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '@/db';
import {
  auditLogs,
  internships,
  logbooks,
  mahasiswa,
  mentorActivationTokens,
  mentorApprovalRequests,
  mentorEmailChangeRequests,
  pembimbingLapangan,
  users,
} from '@/db/schema';

export class MentorWorkflowRepository {
  constructor(private db: DbClient) {}

  async createMentorApprovalRequest(data: typeof mentorApprovalRequests.$inferInsert) {
    await this.db.insert(mentorApprovalRequests).values(data);
    return this.getMentorApprovalRequestById(data.id);
  }

  async getMentorApprovalRequestById(id: string) {
    const rows = await this.db
      .select()
      .from(mentorApprovalRequests)
      .where(eq(mentorApprovalRequests.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async listMentorApprovalRequests() {
    return this.db
      .select({
        id: mentorApprovalRequests.id,
        mentorName: mentorApprovalRequests.mentorName,
        mentorEmail: mentorApprovalRequests.mentorEmail,
        mentorPhone: mentorApprovalRequests.mentorPhone,
        companyName: mentorApprovalRequests.companyName,
        position: mentorApprovalRequests.position,
        status: mentorApprovalRequests.status,
        rejectionReason: mentorApprovalRequests.rejectionReason,
        createdAt: mentorApprovalRequests.createdAt,
        reviewedAt: mentorApprovalRequests.reviewedAt,
        studentUserId: users.id,
        studentName: users.nama,
        studentEmail: users.email,
        studentNim: mahasiswa.nim,
      })
      .from(mentorApprovalRequests)
      .innerJoin(users, eq(mentorApprovalRequests.studentUserId, users.id))
      .leftJoin(mahasiswa, eq(users.id, mahasiswa.id))
      .orderBy(desc(mentorApprovalRequests.createdAt));
  }

  async updateMentorApprovalRequest(id: string, data: Partial<typeof mentorApprovalRequests.$inferInsert>) {
    await this.db
      .update(mentorApprovalRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(mentorApprovalRequests.id, id));
    return this.getMentorApprovalRequestById(id);
  }

  async getMahasiswaByUserId(userId: string) {
    const rows = await this.db
      .select()
      .from(mahasiswa)
      .where(eq(mahasiswa.id, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getActiveInternshipByMahasiswaNim(nim: string) {
    const rows = await this.db
      .select()
      .from(internships)
      .where(and(eq(internships.mahasiswaId, nim), eq(internships.status, 'AKTIF')))
      .limit(1);
    return rows[0] ?? null;
  }

  async assignMentorToInternship(internshipId: string, mentorId: string) {
    await this.db
      .update(internships)
      .set({ pembimbingLapanganId: mentorId, updatedAt: new Date() })
      .where(eq(internships.id, internshipId));
  }

  async findUserByEmail(email: string) {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  async findUserById(userId: string) {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async createMentorUser(data: typeof users.$inferInsert) {
    await this.db.insert(users).values(data);
    return this.findUserById(data.id);
  }

  async updateUser(userId: string, data: Partial<typeof users.$inferInsert>) {
    await this.db.update(users).set(data).where(eq(users.id, userId));
    return this.findUserById(userId);
  }

  async findMentorProfileById(mentorId: string) {
    const rows = await this.db
      .select()
      .from(pembimbingLapangan)
      .where(eq(pembimbingLapangan.id, mentorId))
      .limit(1);
    return rows[0] ?? null;
  }

  async createMentorProfile(data: typeof pembimbingLapangan.$inferInsert) {
    await this.db.insert(pembimbingLapangan).values(data);
    return this.findMentorProfileById(data.id);
  }

  async updateMentorProfile(mentorId: string, data: Partial<typeof pembimbingLapangan.$inferInsert>) {
    await this.db.update(pembimbingLapangan).set(data).where(eq(pembimbingLapangan.id, mentorId));
    return this.findMentorProfileById(mentorId);
  }

  async createActivationToken(data: typeof mentorActivationTokens.$inferInsert) {
    await this.db.insert(mentorActivationTokens).values(data);
    return this.findActivationTokenByToken(data.token);
  }

  async findActivationTokenByToken(token: string) {
    const rows = await this.db
      .select()
      .from(mentorActivationTokens)
      .where(eq(mentorActivationTokens.token, token))
      .limit(1);
    return rows[0] ?? null;
  }

  async findActiveActivationTokenForMentor(mentorId: string) {
    const rows = await this.db
      .select()
      .from(mentorActivationTokens)
      .where(
        and(
          eq(mentorActivationTokens.mentorId, mentorId),
          isNull(mentorActivationTokens.usedAt)
        )
      )
      .orderBy(desc(mentorActivationTokens.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async markActivationTokenUsed(token: string) {
    await this.db
      .update(mentorActivationTokens)
      .set({ usedAt: new Date() })
      .where(eq(mentorActivationTokens.token, token));
  }

  async createMentorEmailChangeRequest(data: typeof mentorEmailChangeRequests.$inferInsert) {
    await this.db.insert(mentorEmailChangeRequests).values(data);
    return this.getMentorEmailChangeRequestById(data.id);
  }

  async getMentorEmailChangeRequestById(id: string) {
    const rows = await this.db
      .select()
      .from(mentorEmailChangeRequests)
      .where(eq(mentorEmailChangeRequests.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async listMentorEmailChangeRequests() {
    return this.db
      .select({
        id: mentorEmailChangeRequests.id,
        mentorId: mentorEmailChangeRequests.mentorId,
        currentEmail: mentorEmailChangeRequests.currentEmail,
        requestedEmail: mentorEmailChangeRequests.requestedEmail,
        reason: mentorEmailChangeRequests.reason,
        status: mentorEmailChangeRequests.status,
        rejectionReason: mentorEmailChangeRequests.rejectionReason,
        createdAt: mentorEmailChangeRequests.createdAt,
        reviewedAt: mentorEmailChangeRequests.reviewedAt,
        mentorName: users.nama,
      })
      .from(mentorEmailChangeRequests)
      .innerJoin(users, eq(mentorEmailChangeRequests.mentorId, users.id))
      .orderBy(desc(mentorEmailChangeRequests.createdAt));
  }

  async updateMentorEmailChangeRequest(id: string, data: Partial<typeof mentorEmailChangeRequests.$inferInsert>) {
    await this.db
      .update(mentorEmailChangeRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(mentorEmailChangeRequests.id, id));
    return this.getMentorEmailChangeRequestById(id);
  }

  async listDosenLogbookMonitor() {
    return this.db
      .select({
        id: logbooks.id,
        date: logbooks.date,
        activity: logbooks.activity,
        description: logbooks.description,
        hours: logbooks.hours,
        status: logbooks.status,
        rejectionReason: logbooks.rejectionReason,
        studentUserId: users.id,
        studentName: users.nama,
        studentEmail: users.email,
        nim: mahasiswa.nim,
        company: internships.companyName,
        mentorId: internships.pembimbingLapanganId,
      })
      .from(logbooks)
      .innerJoin(internships, eq(logbooks.internshipId, internships.id))
      .innerJoin(mahasiswa, eq(internships.mahasiswaId, mahasiswa.nim))
      .innerJoin(users, eq(mahasiswa.id, users.id))
      .orderBy(desc(logbooks.date), desc(logbooks.createdAt));
  }

  async listDosenLogbookMonitorByStudent(studentUserId: string) {
    return this.db
      .select({
        id: logbooks.id,
        date: logbooks.date,
        activity: logbooks.activity,
        description: logbooks.description,
        hours: logbooks.hours,
        status: logbooks.status,
        rejectionReason: logbooks.rejectionReason,
        internshipId: internships.id,
        company: internships.companyName,
        mentorId: internships.pembimbingLapanganId,
      })
      .from(logbooks)
      .innerJoin(internships, eq(logbooks.internshipId, internships.id))
      .innerJoin(mahasiswa, eq(internships.mahasiswaId, mahasiswa.nim))
      .where(eq(mahasiswa.id, studentUserId))
      .orderBy(desc(logbooks.date), desc(logbooks.createdAt));
  }

  async createAuditLog(data: typeof auditLogs.$inferInsert) {
    await this.db.insert(auditLogs).values(data);
  }
}
