import { createDbClient } from '@/db';
import { internships, submissions, combinedGrades, reports, teamMembers } from '@/db/schema';
import { eq, and, desc, or, isNotNull } from 'drizzle-orm';

export class ArchiveService {
  private db: ReturnType<typeof createDbClient>;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
  }

  /**
   * Get archived internships for a student
   */
  async getStudentArchive(userId: string) {
    return await this.db
      .select({
        id: internships.id,
        companyName: internships.companyName,
        startDate: internships.startDate,
        endDate: internships.endDate,
        status: internships.status,
        finalScore: combinedGrades.finalScore,
        letterGrade: combinedGrades.letterGrade,
        reportTitle: reports.title,
        archivedAt: internships.archivedAt,
      })
      .from(internships)
      .leftJoin(combinedGrades, eq(internships.id, combinedGrades.internshipId))
      .leftJoin(reports, eq(internships.id, reports.internshipId))
      .where(and(
        eq(internships.mahasiswaId, userId),
        or(
          eq(internships.status, 'SELESAI'), 
          eq(internships.status, 'DIBATALKAN'),
          isNotNull(internships.archivedAt)
        )
      ))
      .orderBy(desc(internships.endDate));
  }

  /**
   * Get archived submissions for a student
   */
  async getStudentSubmissionsArchive(userId: string) {
    return await this.db
      .select({
        id: submissions.id,
        companyName: submissions.companyName,
        division: submissions.division,
        status: submissions.status,
        workflowStage: submissions.workflowStage,
        submittedAt: submissions.submittedAt,
        archivedAt: submissions.archivedAt,
      })
      .from(submissions)
      .innerJoin(teamMembers, eq(submissions.teamId, teamMembers.teamId))
      .where(and(
        eq(teamMembers.mahasiswaId, userId),
        or(
          eq(submissions.workflowStage, 'COMPLETED'),
          eq(submissions.workflowStage, 'REJECTED_ADMIN'),
          eq(submissions.workflowStage, 'REJECTED_DOSEN'),
          isNotNull(submissions.archivedAt)
        )
      ))
      .orderBy(desc(submissions.updatedAt));
  }

  /**
   * Get all archived internships for Admin
   */
  async getAllInternshipArchive() {
    return await this.db
      .select({
        id: internships.id,
        mahasiswaId: internships.mahasiswaId,
        companyName: internships.companyName,
        status: internships.status,
        finalScore: combinedGrades.finalScore,
        letterGrade: combinedGrades.letterGrade,
        createdAt: internships.createdAt,
        archivedAt: internships.archivedAt,
      })
      .from(internships)
      .leftJoin(combinedGrades, eq(internships.id, combinedGrades.internshipId))
      .where(or(
        eq(internships.status, 'SELESAI'), 
        eq(internships.status, 'DIBATALKAN'),
        isNotNull(internships.archivedAt)
      ))
      .orderBy(desc(internships.createdAt));
  }

  /**
   * Get all archived submissions for Admin
   */
  async getAllSubmissionArchive() {
    return await this.db
      .select({
        id: submissions.id,
        companyName: submissions.companyName,
        division: submissions.division,
        status: submissions.status,
        workflowStage: submissions.workflowStage,
        submittedAt: submissions.submittedAt,
        archivedAt: submissions.archivedAt,
      })
      .from(submissions)
      .where(or(
        eq(submissions.workflowStage, 'COMPLETED'),
        eq(submissions.workflowStage, 'REJECTED_ADMIN'),
        eq(submissions.workflowStage, 'REJECTED_DOSEN'),
        isNotNull(submissions.archivedAt)
      ))
      .orderBy(desc(submissions.updatedAt));
  }

  /**
   * Manually archive an internship
   */
  async archiveInternship(internshipId: string) {
    return await this.db
      .update(internships)
      .set({ archivedAt: new Date() })
      .where(eq(internships.id, internshipId))
      .returning();
  }
}
