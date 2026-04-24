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
    try {
      await this.db.insert(mentorApprovalRequests).values(data);
      return this.getMentorApprovalRequestById(data.id);
    } catch (error) {
      console.error('[MentorWorkflowRepository.createMentorApprovalRequest] Error:', error);
      throw error;
    }
  }

  async getMentorApprovalRequestById(id: string) {
    try {
      const rows = await this.db
        .select()
        .from(mentorApprovalRequests)
        .where(eq(mentorApprovalRequests.id, id))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      console.error('[MentorWorkflowRepository.getMentorApprovalRequestById] Error:', error);
      throw error;
    }
  }

  async listMentorApprovalRequests() {
    try {
      return await this.db
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
    } catch (error) {
      console.error('[MentorWorkflowRepository.listMentorApprovalRequests] Error:', error);
      throw error;
    }
  }

  async updateMentorApprovalRequest(id: string, data: Partial<typeof mentorApprovalRequests.$inferInsert>) {
    try {
      await this.db
        .update(mentorApprovalRequests)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(mentorApprovalRequests.id, id));
      return this.getMentorApprovalRequestById(id);
    } catch (error) {
      console.error('[MentorWorkflowRepository.updateMentorApprovalRequest] Error:', error);
      throw error;
    }
  }

  async getMahasiswaByUserId(userId: string) {
    try {
      const rows = await this.db
        .select()
        .from(mahasiswa)
        .where(eq(mahasiswa.id, userId))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      console.error('[MentorWorkflowRepository.getMahasiswaByUserId] Error:', error);
      throw error;
    }
  }

  async getActiveInternshipByMahasiswaNim(nim: string) {
    try {
      const rows = await this.db
        .select()
        .from(internships)
        .where(and(eq(internships.mahasiswaId, nim), eq(internships.status, 'AKTIF')))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      console.error('[MentorWorkflowRepository.getActiveInternshipByMahasiswaNim] Error:', error);
      throw error;
    }
  }

  async assignMentorToInternship(internshipId: string, mentorId: string) {
    try {
      await this.db
        .update(internships)
        .set({ pembimbingLapanganId: mentorId, updatedAt: new Date() })
        .where(eq(internships.id, internshipId));
    } catch (error) {
      console.error('[MentorWorkflowRepository.assignMentorToInternship] Error:', error);
      throw error;
    }
  }

  async findUserByEmail(email: string) {
    try {
      const rows = await this.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      console.error('[MentorWorkflowRepository.findUserByEmail] Error:', error);
      throw error;
    }
  }

  async findUserById(userId: string) {
    try {
      const rows = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      console.error('[MentorWorkflowRepository.findUserById] Error:', error);
      throw error;
    }
  }

  async createMentorUser(data: typeof users.$inferInsert) {
    try {
      await this.db.insert(users).values(data);
      return this.findUserById(data.id);
    } catch (error) {
      console.error('[MentorWorkflowRepository.createMentorUser] Error:', error);
      throw error;
    }
  }

  async updateUser(userId: string, data: Partial<typeof users.$inferInsert>) {
    try {
      await this.db.update(users).set(data).where(eq(users.id, userId));
      return this.findUserById(userId);
    } catch (error) {
      console.error('[MentorWorkflowRepository.updateUser] Error:', error);
      throw error;
    }
  }

  async findMentorProfileById(mentorId: string) {
    try {
      const rows = await this.db
        .select()
        .from(pembimbingLapangan)
        .where(eq(pembimbingLapangan.id, mentorId))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      console.error('[MentorWorkflowRepository.findMentorProfileById] Error:', error);
      throw error;
    }
  }

  async createMentorProfile(data: typeof pembimbingLapangan.$inferInsert) {
    try {
      await this.db.insert(pembimbingLapangan).values(data);
      return this.findMentorProfileById(data.id);
    } catch (error) {
      console.error('[MentorWorkflowRepository.createMentorProfile] Error:', error);
      throw error;
    }
  }

  async updateMentorProfile(mentorId: string, data: Partial<typeof pembimbingLapangan.$inferInsert>) {
    try {
      await this.db.update(pembimbingLapangan).set(data).where(eq(pembimbingLapangan.id, mentorId));
      return this.findMentorProfileById(mentorId);
    } catch (error) {
      console.error('[MentorWorkflowRepository.updateMentorProfile] Error:', error);
      throw error;
    }
  }

  async createActivationToken(data: typeof mentorActivationTokens.$inferInsert) {
    try {
      await this.db.insert(mentorActivationTokens).values(data);
      return this.findActivationTokenByToken(data.token);
    } catch (error) {
      console.error('[MentorWorkflowRepository.createActivationToken] Error:', error);
      throw error;
    }
  }

  async findActivationTokenByToken(token: string) {
    try {
      const rows = await this.db
        .select()
        .from(mentorActivationTokens)
        .where(eq(mentorActivationTokens.token, token))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      console.error('[MentorWorkflowRepository.findActivationTokenByToken] Error:', error);
      throw error;
    }
  }

  async findActiveActivationTokenForMentor(mentorId: string) {
    try {
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
    } catch (error) {
      console.error('[MentorWorkflowRepository.findActiveActivationTokenForMentor] Error:', error);
      throw error;
    }
  }

  async markActivationTokenUsed(token: string) {
    try {
      await this.db
        .update(mentorActivationTokens)
        .set({ usedAt: new Date() })
        .where(eq(mentorActivationTokens.token, token));
    } catch (error) {
      console.error('[MentorWorkflowRepository.markActivationTokenUsed] Error:', error);
      throw error;
    }
  }

  async createMentorEmailChangeRequest(data: typeof mentorEmailChangeRequests.$inferInsert) {
    try {
      await this.db.insert(mentorEmailChangeRequests).values(data);
      return this.getMentorEmailChangeRequestById(data.id);
    } catch (error) {
      console.error('[MentorWorkflowRepository.createMentorEmailChangeRequest] Error:', error);
      throw error;
    }
  }

  async getMentorEmailChangeRequestById(id: string) {
    try {
      const rows = await this.db
        .select()
        .from(mentorEmailChangeRequests)
        .where(eq(mentorEmailChangeRequests.id, id))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      console.error('[MentorWorkflowRepository.getMentorEmailChangeRequestById] Error:', error);
      throw error;
    }
  }

  async listMentorEmailChangeRequests() {
    try {
      return await this.db
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
    } catch (error) {
      console.error('[MentorWorkflowRepository.listMentorEmailChangeRequests] Error:', error);
      throw error;
    }
  }

  async updateMentorEmailChangeRequest(id: string, data: Partial<typeof mentorEmailChangeRequests.$inferInsert>) {
    try {
      await this.db
        .update(mentorEmailChangeRequests)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(mentorEmailChangeRequests.id, id));
      return this.getMentorEmailChangeRequestById(id);
    } catch (error) {
      console.error('[MentorWorkflowRepository.updateMentorEmailChangeRequest] Error:', error);
      throw error;
    }
  }

  async listDosenLogbookMonitor() {
    try {
      return await this.db
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
    } catch (error) {
      console.error('[MentorWorkflowRepository.listDosenLogbookMonitor] Error:', error);
      throw error;
    }
  }

  async listDosenLogbookMonitorByStudent(studentUserId: string) {
    try {
      return await this.db
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
    } catch (error) {
      console.error('[MentorWorkflowRepository.listDosenLogbookMonitorByStudent] Error:', error);
      throw error;
    }
  }

  async createAuditLog(data: typeof auditLogs.$inferInsert) {
    try {
      await this.db.insert(auditLogs).values(data);
    } catch (error) {
      console.error('[MentorWorkflowRepository.createAuditLog] Error:', error);
      throw error;
    }
  }
}
