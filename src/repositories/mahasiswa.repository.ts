import { eq, and, or, desc } from "drizzle-orm";
import type { DbClient } from "@/db";
import { internships, submissions, teams, teamMembers } from "@/db/schema";

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
  async getInternshipData(mahasiswaId: string) {
    console.log(
      `[MahasiswaRepository] Querying internship data for: ${mahasiswaId}`,
    );
    const result = await this.db
      .select({
        studentId: internships.mahasiswaId,
        submissionId: submissions.id,
        teamId: teams.id,
        company: submissions.companyName,
        companyAddress: submissions.companyAddress,
        division: submissions.division,
        submissionStartDate: submissions.startDate,
        submissionEndDate: submissions.endDate,
        submissionStatus: submissions.status,
        submittedAt: submissions.submittedAt,
        approvedAt: submissions.approvedAt,
        approvedBy: submissions.approvedByAdminId,
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
      .leftJoin(teams, eq(teamMembers.teamId, teams.id))
      .leftJoin(submissions, eq(teams.id, submissions.teamId))
      .leftJoin(
        internships,
        eq(teamMembers.mahasiswaId, internships.mahasiswaId),
      )
      .where(eq(teamMembers.mahasiswaId, mahasiswaId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get complete internship data by internship ID
   * Note: Student details (name, nim) are resolved via service layer.
   */
  async getInternshipDataByInternshipId(internshipId: string) {
    console.log(
      `[MahasiswaRepository] Querying internship data by internshipId: ${internshipId}`,
    );
    const result = await this.db
      .select({
        studentId: teamMembers.mahasiswaId,
        submissionId: submissions.id,
        teamId: teams.id,
        company: submissions.companyName,
        companyAddress: submissions.companyAddress,
        division: submissions.division,
        submissionStartDate: submissions.startDate,
        submissionEndDate: submissions.endDate,
        submissionStatus: submissions.status,
        submittedAt: submissions.submittedAt,
        approvedAt: submissions.approvedAt,
        approvedBy: submissions.approvedByAdminId,
        internshipId: internships.id,
        internshipStatus: internships.status,
        pembimbingLapanganId: internships.pembimbingLapanganId,
        dosenPembimbingId: internships.dosenPembimbingId,
        internshipStartDate: internships.startDate,
        internshipEndDate: internships.endDate,
        internshipCreatedAt: internships.createdAt,
        internshipUpdatedAt: internships.updatedAt,
      })
      .from(internships)
      .leftJoin(
        teamMembers,
        eq(internships.mahasiswaId, teamMembers.mahasiswaId),
      )
      .leftJoin(teams, eq(teamMembers.teamId, teams.id))
      .leftJoin(submissions, eq(teams.id, submissions.teamId))
      .where(eq(internships.id, internshipId))
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
          eq(internships.status, "AKTIF"),
        ),
      )
      .limit(1);

    return result.length > 0;
  }
}
