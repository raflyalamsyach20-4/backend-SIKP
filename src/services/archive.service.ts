import { createDbClient } from '@/db';
import { internships, submissions, combinedGrades, reports, teamMembers } from '@/db/schema';
import { eq, and, desc, or } from 'drizzle-orm';

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
      })
      .from(internships)
      .leftJoin(combinedGrades, eq(internships.id, combinedGrades.internshipId))
      .leftJoin(reports, eq(internships.id, reports.internshipId))
      .where(and(
        eq(internships.mahasiswaId, userId),
        or(eq(internships.status, 'SELESAI'), eq(internships.status, 'DIBATALKAN'))
      ))
      .orderBy(desc(internships.endDate));
  }

  /**
   * Get all archived internships for Admin
   */
  async getAllArchive() {
    return await this.db
      .select({
        id: internships.id,
        mahasiswaId: internships.mahasiswaId,
        companyName: internships.companyName,
        status: internships.status,
        finalScore: combinedGrades.finalScore,
        letterGrade: combinedGrades.letterGrade,
        year: internships.createdAt,
      })
      .from(internships)
      .leftJoin(combinedGrades, eq(internships.id, combinedGrades.internshipId))
      .where(or(eq(internships.status, 'SELESAI'), eq(internships.status, 'DIBATALKAN')))
      .orderBy(desc(internships.createdAt));
  }
}
