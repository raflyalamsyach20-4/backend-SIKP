import { eq, and, desc } from 'drizzle-orm';
import type { DbClient } from '@/db';
import {
  internships,
  assessments,
  mentors,
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
  async getMentees(mentorId: string) {
    try {
      const result = await this.db
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
        .where(eq(internships.pembimbingLapanganId, mentorId))
        .orderBy(desc(internships.createdAt));
      return result;
    } catch (error) {
      console.error('[MentorRepository.getMentees] Error:', error);
      throw error;
    }
  }

  async getMenteeByStudentId(mentorId: string, studentUserId: string) {
    try {
      const result = await this.db
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
            eq(internships.pembimbingLapanganId, mentorId),
            eq(internships.mahasiswaId, studentUserId)
          )
        )
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error('[MentorRepository.getMenteeByStudentId] Error:', error);
      throw error;
    }
  }

  /**
   * Get internship ID for a mentee supervised by this mentor
   */
  async getInternshipIdForMentee(mentorId: string, studentUserId: string): Promise<string | null> {
    try {
      const result = await this.db
        .select({ internshipId: internships.id })
        .from(internships)
        .where(
          and(
            eq(internships.pembimbingLapanganId, mentorId),
            eq(internships.mahasiswaId, studentUserId)
          )
        )
        .limit(1);
      return result[0]?.internshipId ?? null;
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

  // ─── Profile ───────────────────────────────────────────────────────────────

  async findProfileById(id: string) {
    try {
      const result = await this.db
        .select()
        .from(mentors)
        .where(eq(mentors.id, id))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error('[MentorRepository.findProfileById] Error:', error);
      throw error;
    }
  }

  async updateProfile(id: string, data: Partial<typeof mentors.$inferInsert>) {
    try {
      await this.db
        .update(mentors)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(mentors.id, id));
      return this.findProfileById(id);
    } catch (error) {
      console.error('[MentorRepository.updateProfile] Error:', error);
      throw error;
    }
  }
}

