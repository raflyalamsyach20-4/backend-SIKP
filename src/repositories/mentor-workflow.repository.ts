import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '@/db';
import {
  auditLogs,
  internships,
  logbooks,
  mentorActivationTokens,
  mentorApprovalRequests,
  mentorEmailChangeRequests,
  mentors,
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
          studentUserId: mentorApprovalRequests.studentUserId,
        })
        .from(mentorApprovalRequests)
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

  async getActiveInternshipByMahasiswaId(userId: string) {
    try {
      const rows = await this.db
        .select()
        .from(internships)
        .where(and(eq(internships.mahasiswaId, userId), eq(internships.status, 'AKTIF')))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      console.error('[MentorWorkflowRepository.getActiveInternshipByMahasiswaId] Error:', error);
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
        .select()
        .from(mentorEmailChangeRequests)
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
          studentId: internships.mahasiswaId,
          company: internships.companyName,
          mentorId: internships.pembimbingLapanganId,
        })
        .from(logbooks)
        .innerJoin(internships, eq(logbooks.internshipId, internships.id))
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
        .where(eq(internships.mahasiswaId, studentUserId))
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

  async createMentorProfile(data: typeof mentors.$inferInsert) {
    try {
      await this.db.insert(mentors).values(data).onConflictDoUpdate({
        target: mentors.id,
        set: { ...data, updatedAt: new Date() }
      });
      const rows = await this.db.select().from(mentors).where(eq(mentors.id, data.id)).limit(1);
      return rows[0] ?? null;
    } catch (error) {
      console.error('[MentorWorkflowRepository.createMentorProfile] Error:', error);
      throw error;
    }
  }
}

