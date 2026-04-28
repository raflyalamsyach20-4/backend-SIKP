import { eq, and, desc } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { 
  internships, 
  submissions, 
  teams,
  teamMembers
} from '@/db/schema';

export interface UpdateProfileData {
  nama?: string;
  phone?: string;
  prodi?: string;
  fakultas?: string;
  semester?: number;
  angkatan?: string;
}

export class MahasiswaRepository {
  constructor(private db: DbClient) {}

  /**
   * Get complete internship data (student + submission + internship + mentor + lecturer)
   * Note: Student details (name, nim) are not joined here and should be resolved by the service.
   */
  async getInternshipData(userId: string) {
    const result = await this.db
      .select({
        // Student ID (from input or joined tables)
        studentId: teamMembers.mahasiswaId,
        
        // Submission data
        submissionId: submissions.id,
        teamId: submissions.teamId,
        company: submissions.companyName,
        companyAddress: submissions.companyAddress,
        division: submissions.division,
        submissionStartDate: submissions.startDate,
        submissionEndDate: submissions.endDate,
        submissionStatus: submissions.status,
        submittedAt: submissions.submittedAt,
        approvedAt: submissions.approvedAt,
        approvedBy: submissions.approvedByAdminId,
        
        // Internship data
        internshipId: internships.id,
        internshipStatus: internships.status,
        pembimbingLapanganId: internships.pembimbingLapanganId,
        dosenPembimbingId: internships.dosenPembimbingId,
        internshipStartDate: internships.startDate,
        internshipEndDate: internships.endDate,
        internshipCreatedAt: internships.createdAt,
        internshipUpdatedAt: internships.updatedAt,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .innerJoin(
        submissions, 
        and(
          eq(teams.id, submissions.teamId),
          eq(submissions.status, 'APPROVED')
        )
      )
      .leftJoin(
        internships, 
        and(
          eq(teamMembers.mahasiswaId, internships.mahasiswaId),
          eq(submissions.id, internships.submissionId)
        )
      )
      .where(eq(teamMembers.mahasiswaId, userId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Check if mahasiswa has an active internship
   */
  async hasActiveInternship(mahasiswaId: string) {
    const result = await this.db
      .select()
      .from(internships)
      .where(
        and(
          eq(internships.mahasiswaId, mahasiswaId),
          eq(internships.status, 'AKTIF')
        )
      )
      .limit(1);

    return result.length > 0;
  }
}

