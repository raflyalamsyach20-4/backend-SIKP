import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { internships, logbooks } from '@/db/schema';

export class MonitoringRepository {
  constructor(private db: DbClient) {}

  /**
   * Get progress of all mentees for a specific lecturer
   */
  async getLecturerMenteesProgress(lecturerId: string) {
    try {
      // 1. Get basic internship & student info
      const mentees = await this.db
        .select({
          internshipId: internships.id,
          mahasiswaId: internships.mahasiswaId,
          companyName: internships.companyName,
          startDate: internships.startDate,
          endDate: internships.endDate,
          status: internships.status,
        })
        .from(internships)
        .where(eq(internships.dosenPembimbingId, lecturerId));

      // 2. For each mentee, get logbook stats
      // Note: In a real high-scale app, we'd do a complex group-by join.
      // For now, let's do it efficiently with subqueries or separate calls if needed.
      const enrichedMentees = await Promise.all(
        mentees.map(async (m) => {
          const stats = await this.db
            .select({
              totalHours: sql<number>`sum(case when ${logbooks.status} = 'APPROVED' then ${logbooks.hours} else 0 end)`,
              totalPending: sql<number>`count(case when ${logbooks.status} = 'PENDING' then 1 else null end)`,
              totalApproved: sql<number>`count(case when ${logbooks.status} = 'APPROVED' then 1 else null end)`,
              lastLogbookDate: sql<string>`max(${logbooks.date})`,
            })
            .from(logbooks)
            .where(eq(logbooks.internshipId, m.internshipId));

          return {
            ...m,
            stats: stats[0] || { totalHours: 0, totalPending: 0, totalApproved: 0, lastLogbookDate: null },
          };
        })
      );

      return enrichedMentees;
    } catch (error) {
      console.error('[MonitoringRepository.getLecturerMenteesProgress] Error:', error);
      throw error;
    }
  }

  /**
   * Get logbooks for a specific student, verified to be under this lecturer
   */
  async getStudentLogbooksForLecturer(lecturerId: string, studentUserId: string) {
    return await this.db
      .select({
        logbook: logbooks,
        internship: internships,
      })
      .from(logbooks)
      .innerJoin(internships, eq(logbooks.internshipId, internships.id))
      .where(
        and(
          eq(internships.dosenPembimbingId, lecturerId),
          eq(internships.mahasiswaId, studentUserId)
        )
      )
      .orderBy(desc(logbooks.date), desc(logbooks.createdAt));
  }
}
