import { eq, and, desc } from 'drizzle-orm';
import type { DbClient } from '@/db';
import {
  internships,
  assessments,
  mentorSignatures,
  mentorApprovalRequests,
} from '@/db/schema';
import { generateId } from '@/utils/helpers';

export interface CreateAssessmentData {
  internshipId: string;
  kehadiran: number;
  kerjasama: number;
  sikapEtika: number;
  prestasiKerja: number;
  kreatifitas: number;
  feedback?: string;
}

export interface UpdateAssessmentData {
  kehadiran?: number;
  kerjasama?: number;
  sikapEtika?: number;
  prestasiKerja?: number;
  kreatifitas?: number;
  feedback?: string;
}

export class MentorRepository {
  constructor(private db: DbClient) {}

  // ─── Mentees ────────────────────────────────────────────────────────────────

  /**
   * Get all mentees supervised by this mentor
   * Note: Mentee details (name, nim) should be resolved by the service/controller.
   */
  async getMentees(mentorProfileId: string, identityId: string) {
    console.log(`[MentorRepository.getMentees] Searching for ProfileID: ${mentorProfileId}, IdentityID: ${identityId}`);
    try {
      // 1. Try direct lookup by Profile ID (standard)
      const directResult = await this.db
        .select({
          internshipId: internships.id,
          internshipStatus: internships.status,
          internshipStartDate: internships.startDate,
          internshipEndDate: internships.endDate,
          companyName: internships.companyName,
          division: internships.division,
          studentId: internships.mahasiswaId,
          createdAt: internships.createdAt,
        })
        .from(internships)
        .where(eq(internships.pembimbingLapanganId, mentorProfileId))
        .orderBy(desc(internships.createdAt));

      if (directResult.length > 0) {
        console.log(`[MentorRepository.getMentees] Found ${directResult.length} mentees via direct ProfileID lookup.`);
        return directResult;
      }

      console.log(`[MentorRepository.getMentees] Direct lookup empty. Trying IdentityID fallback...`);
      // 2. Fallback: Search via mentor_approval_requests using the identityId
      const fallbackResult = await this.db
        .select({
          internshipId: internships.id,
          internshipStatus: internships.status,
          internshipStartDate: internships.startDate,
          internshipEndDate: internships.endDate,
          companyName: internships.companyName,
          division: internships.division,
          studentId: internships.mahasiswaId,
          createdAt: internships.createdAt,
        })
        .from(internships)
        .innerJoin(
          mentorApprovalRequests,
          eq(internships.mahasiswaId, mentorApprovalRequests.studentUserId)
        )
        .where(
          and(
            eq(mentorApprovalRequests.ssoMentorId, identityId),
            eq(mentorApprovalRequests.status, 'APPROVED')
          )
        )
        .orderBy(desc(internships.createdAt));

      console.log(`[MentorRepository.getMentees] Fallback found ${fallbackResult.length} mentees.`);
      return fallbackResult;
    } catch (error) {
      console.error('[MentorRepository.getMentees] Error:', error);
      throw error;
    }
  }

  async getMenteeByStudentId(mentorProfileId: string, identityId: string, studentUserId: string) {
    try {
      // 1. Direct
      const direct = await this.db
        .select({
          internshipId: internships.id,
          internshipStatus: internships.status,
          internshipStartDate: internships.startDate,
          internshipEndDate: internships.endDate,
          companyName: internships.companyName,
          division: internships.division,
          studentId: internships.mahasiswaId,
        })
        .from(internships)
        .where(
          and(
            eq(internships.pembimbingLapanganId, mentorProfileId),
            eq(internships.mahasiswaId, studentUserId)
          )
        )
        .limit(1);

      if (direct.length > 0) return direct[0];

      // 2. Fallback
      const fallback = await this.db
        .select({
          internshipId: internships.id,
          internshipStatus: internships.status,
          internshipStartDate: internships.startDate,
          internshipEndDate: internships.endDate,
          companyName: internships.companyName,
          division: internships.division,
          studentId: internships.mahasiswaId,
        })
        .from(internships)
        .innerJoin(
          mentorApprovalRequests,
          eq(internships.mahasiswaId, mentorApprovalRequests.studentUserId)
        )
        .where(
          and(
            eq(mentorApprovalRequests.ssoMentorId, identityId),
            eq(mentorApprovalRequests.studentUserId, studentUserId),
            eq(mentorApprovalRequests.status, 'APPROVED')
          )
        )
        .limit(1);

      return fallback[0] ?? null;
    } catch (error) {
      console.error('[MentorRepository.getMenteeByStudentId] Error:', error);
      throw error;
    }
  }

  /**
   * Get internship ID for a mentee supervised by this mentor
   */
  async getInternshipIdForMentee(mentorProfileId: string, identityId: string, studentUserId: string): Promise<string | null> {
    try {
      // 1. Direct
      const direct = await this.db
        .select({ internshipId: internships.id })
        .from(internships)
        .where(
          and(
            eq(internships.pembimbingLapanganId, mentorProfileId),
            eq(internships.mahasiswaId, studentUserId)
          )
        )
        .limit(1);

      if (direct.length > 0) return direct[0].internshipId;

      // 2. Fallback
      const fallback = await this.db
        .select({ internshipId: internships.id })
        .from(internships)
        .innerJoin(
          mentorApprovalRequests,
          eq(internships.mahasiswaId, mentorApprovalRequests.studentUserId)
        )
        .where(
          and(
            eq(mentorApprovalRequests.ssoMentorId, identityId),
            eq(mentorApprovalRequests.studentUserId, studentUserId),
            eq(mentorApprovalRequests.status, 'APPROVED')
          )
        )
        .limit(1);

      return fallback[0]?.internshipId ?? null;
    } catch (error) {
      console.error('[MentorRepository.getInternshipIdForMentee] Error:', error);
      throw error;
    }
  }

  // ─── Assessments ────────────────────────────────────────────────────────────

  private computeTotal(data: { kehadiran: number; kerjasama: number; sikapEtika: number; prestasiKerja: number; kreatifitas: number }) {
    return Math.round(
      data.kehadiran * 0.2 +
      data.kerjasama * 0.3 +
      data.sikapEtika * 0.2 +
      data.prestasiKerja * 0.2 +
      data.kreatifitas * 0.1
    );
  }

  async createAssessment(mentorId: string, data: CreateAssessmentData) {
    try {
      const id = generateId();
      const now = new Date();
      const totalScore = this.computeTotal(data);

      await this.db.insert(assessments).values({
        id,
        internshipId: data.internshipId,
        pembimbingLapanganId: mentorId,
        kehadiran: data.kehadiran,
        kerjasama: data.kerjasama,
        sikapEtika: data.sikapEtika,
        prestasiKerja: data.prestasiKerja,
        kreatifitas: data.kreatifitas,
        totalScore,
        feedback: data.feedback ?? null,
        assessedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return this.findAssessmentById(id);
    } catch (error) {
      console.error('[MentorRepository.createAssessment] Error:', error);
      throw error;
    }
  }

  async findAssessmentById(id: string) {
    try {
      const result = await this.db
        .select()
        .from(assessments)
        .where(eq(assessments.id, id))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error('[MentorRepository.findAssessmentById] Error:', error);
      throw error;
    }
  }

  async getAssessmentByInternshipId(internshipId: string) {
    try {
      const result = await this.db
        .select()
        .from(assessments)
        .where(eq(assessments.internshipId, internshipId))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error('[MentorRepository.getAssessmentByInternshipId] Error:', error);
      throw error;
    }
  }

  async updateAssessment(id: string, data: UpdateAssessmentData) {
    try {
      const existing = await this.findAssessmentById(id);
      if (!existing) return null;

      const merged = {
        kehadiran: data.kehadiran ?? existing.kehadiran,
        kerjasama: data.kerjasama ?? existing.kerjasama,
        sikapEtika: data.sikapEtika ?? existing.sikapEtika,
        prestasiKerja: data.prestasiKerja ?? existing.prestasiKerja,
        kreatifitas: data.kreatifitas ?? existing.kreatifitas,
      };

      const totalScore = this.computeTotal(merged);

      await this.db
        .update(assessments)
        .set({
          ...merged,
          totalScore,
          feedback: data.feedback !== undefined ? data.feedback : existing.feedback,
          updatedAt: new Date(),
        })
        .where(eq(assessments.id, id));

      return this.findAssessmentById(id);
    } catch (error) {
      console.error('[MentorRepository.updateAssessment] Error:', error);
      throw error;
    }
  }

  // ─── Profile & Signature ───────────────────────────────────────────────────

  async findProfileById(id: string) {
    try {
      const result = await this.db
        .select()
        .from(mentorSignatures)
        .where(eq(mentorSignatures.id, id))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error('[MentorRepository.findProfileById] Error:', error);
      throw error;
    }
  }

  async updateProfile(id: string, data: Partial<typeof mentorSignatures.$inferInsert>) {
    try {
      await this.db
        .update(mentorSignatures)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(mentorSignatures.id, id));
      return this.findProfileById(id);
    } catch (error) {
      console.error('[MentorRepository.updateProfile] Error:', error);
      throw error;
    }
  }

  // ─── Approval Requests ─────────────────────────────────────────────────────

  async findRequestBySsoMentorId(ssoMentorId: string) {
    try {
      const result = await this.db
        .select()
        .from(mentorApprovalRequests)
        .where(eq(mentorApprovalRequests.ssoMentorId, ssoMentorId))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error('[MentorRepository.findRequestBySsoMentorId] Error:', error);
      throw error;
    }
  }

  async findLatestRequestByMahasiswaId(mahasiswaId: string) {
    try {
      const result = await this.db
        .select()
        .from(mentorApprovalRequests)
        .where(eq(mentorApprovalRequests.studentUserId, mahasiswaId))
        .orderBy(desc(mentorApprovalRequests.createdAt))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error('[MentorRepository.findLatestRequestByMahasiswaId] Error:', error);
      throw error;
    }
  }
}

