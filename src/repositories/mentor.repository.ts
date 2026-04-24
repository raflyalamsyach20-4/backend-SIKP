import { eq, and, desc } from 'drizzle-orm';
import type { DbClient } from '@/db';
import {
  users,
  pembimbingLapangan,
  internships,
  mahasiswa,
  assessments,
} from '@/db/schema';
import { generateId } from '@/utils/helpers';

export interface UpdateMentorProfileData {
  nama?: string;
  phone?: string;
  companyName?: string;
  position?: string;
  companyAddress?: string;
}

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

  // ─── Profile ────────────────────────────────────────────────────────────────

  async getProfile(mentorId: string) {
    try {
      const result = await this.db
        .select({
          id: users.id,
          nama: users.nama,
          email: users.email,
          phone: users.phone,
          companyName: pembimbingLapangan.companyName,
          position: pembimbingLapangan.position,
          companyAddress: pembimbingLapangan.companyAddress,
          signature: pembimbingLapangan.signature,
          signatureSetAt: pembimbingLapangan.signatureSetAt,
        })
        .from(users)
        .innerJoin(pembimbingLapangan, eq(users.id, pembimbingLapangan.id))
        .where(eq(users.id, mentorId))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error('[MentorRepository.getProfile] Error:', error);
      throw error;
    }
  }

  async updateProfile(mentorId: string, data: UpdateMentorProfileData) {
    try {
      const userFields: Record<string, any> = {};
      if (data.nama !== undefined) userFields.nama = data.nama;
      if (data.phone !== undefined) userFields.phone = data.phone;

      if (Object.keys(userFields).length > 0) {
        await this.db.update(users).set(userFields).where(eq(users.id, mentorId));
      }

      const plFields: Record<string, any> = {};
      if (data.companyName !== undefined) plFields.companyName = data.companyName;
      if (data.position !== undefined) plFields.position = data.position;
      if (data.companyAddress !== undefined) plFields.companyAddress = data.companyAddress;

      if (Object.keys(plFields).length > 0) {
        await this.db.update(pembimbingLapangan).set(plFields).where(eq(pembimbingLapangan.id, mentorId));
      }

      return this.getProfile(mentorId);
    } catch (error) {
      console.error('[MentorRepository.updateProfile] Error:', error);
      throw error;
    }
  }

  // ─── Signature ──────────────────────────────────────────────────────────────

  async getSignature(mentorId: string) {
    try {
      const result = await this.db
        .select({
          signature: pembimbingLapangan.signature,
          signatureSetAt: pembimbingLapangan.signatureSetAt,
        })
        .from(pembimbingLapangan)
        .where(eq(pembimbingLapangan.id, mentorId))
        .limit(1);
      return result[0] ?? null;
    } catch (error) {
      console.error('[MentorRepository.getSignature] Error:', error);
      throw error;
    }
  }

  async updateSignature(mentorId: string, signatureBase64: string) {
    try {
      const now = new Date();
      await this.db
        .update(pembimbingLapangan)
        .set({ signature: signatureBase64, signatureSetAt: now })
        .where(eq(pembimbingLapangan.id, mentorId));
      return this.getSignature(mentorId);
    } catch (error) {
      console.error('[MentorRepository.updateSignature] Error:', error);
      throw error;
    }
  }

  async deleteSignature(mentorId: string) {
    try {
      await this.db
        .update(pembimbingLapangan)
        .set({ signature: null, signatureSetAt: null })
        .where(eq(pembimbingLapangan.id, mentorId));
    } catch (error) {
      console.error('[MentorRepository.deleteSignature] Error:', error);
      throw error;
    }
  }

  // ─── Mentees ────────────────────────────────────────────────────────────────

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
          nim: mahasiswa.nim,
          userId: users.id,
          nama: users.nama,
          email: users.email,
          phone: users.phone,
          signature: pembimbingLapangan.signature,
        })
        .from(internships)
        .innerJoin(mahasiswa, eq(internships.mahasiswaId, mahasiswa.nim))
        .innerJoin(users, eq(mahasiswa.id, users.id))
        .innerJoin(pembimbingLapangan, eq(internships.pembimbingLapanganId, pembimbingLapangan.id))
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
          nim: mahasiswa.nim,
          userId: users.id,
          nama: users.nama,
          email: users.email,
          phone: users.phone,
        })
        .from(internships)
        .innerJoin(mahasiswa, eq(internships.mahasiswaId, mahasiswa.nim))
        .innerJoin(users, eq(mahasiswa.id, users.id))
        .where(
          and(
            eq(internships.pembimbingLapanganId, mentorId),
            eq(mahasiswa.id, studentUserId)
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
   * Get internship ID for a mentee supervised by this mentor (by NIM or userId)
   */
  async getInternshipIdForMentee(mentorId: string, studentUserId: string): Promise<string | null> {
    try {
      const result = await this.db
        .select({ internshipId: internships.id })
        .from(internships)
        .innerJoin(mahasiswa, eq(internships.mahasiswaId, mahasiswa.nim))
        .where(
          and(
            eq(internships.pembimbingLapanganId, mentorId),
            eq(mahasiswa.id, studentUserId)
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
}
