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
      console.log(`[MonitoringRepository.getLecturerMenteesProgress] Fetching for lecturerId: ${lecturerId}`);
      // 1. Get basic internship & student info
      // Include student if lecturer is assigned as Pembimbing KP OR as Dosen PA
      const mentees = await this.db
        .select({
          internshipId: internships.id,
          mahasiswaId: internships.mahasiswaId,
          companyName: internships.companyName,
          startDate: internships.startDate,
          endDate: internships.endDate,
          status: internships.status,
          dosenPaId: internships.dosenPaId,
          dosenPembimbingId: internships.dosenPembimbingId,
        })
        .from(internships)
        .where(
          sql`${internships.dosenPembimbingId} = ${lecturerId} OR ${internships.dosenPaId} = ${lecturerId}`
        );
      
      console.log(`[MonitoringRepository.getLecturerMenteesProgress] Found ${mentees.length} matches in DB`);

      // 2. For each mentee, get logbook stats
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
   * Get logbooks for a specific student, verified to be under this lecturer (as Pembimbing OR PA)
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
          sql`${internships.dosenPembimbingId} = ${lecturerId} OR ${internships.dosenPaId} = ${lecturerId}`,
          eq(internships.mahasiswaId, studentUserId)
        )
      )
      .orderBy(desc(logbooks.date), desc(logbooks.createdAt));
  }

  async updateDosenPaId(internshipId: string, dosenPaId: string) {
    return await this.db
      .update(internships)
      .set({ dosenPaId, updatedAt: new Date() })
      .where(eq(internships.id, internshipId))
      .returning();
  }

  async getAllActiveInternships() {
    return await this.db
      .select()
      .from(internships)
      .where(eq(internships.status, 'AKTIF'));
  }
}
