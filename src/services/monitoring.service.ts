import { createDbClient } from '@/db';
import { MonitoringRepository } from '@/repositories/monitoring.repository';
import { MahasiswaService } from './mahasiswa.service';

export class MonitoringService {
  private monitoringRepo: MonitoringRepository;
  private mahasiswaService: MahasiswaService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.monitoringRepo = new MonitoringRepository(db);
    this.mahasiswaService = new MahasiswaService(this.env);
  }

  /**
   * Get all supervisees with their progress stats, enriched with SSO data
   */
  async getMenteesProgress(lecturerId: string, sessionId: string) {
    const mentees = await this.monitoringRepo.getLecturerMenteesProgress(lecturerId);
    
    const enriched = await Promise.all(
      mentees.map(async (m) => {
        const profile = await this.mahasiswaService.getMahasiswaById(m.mahasiswaId, sessionId);
        return {
          ...m,
          studentName: profile?.profile.fullName || 'N/A',
          nim: profile?.nim || 'N/A',
        };
      })
    );

    return enriched;
  }

  /**
   * Get logbooks for a specific student supervisee
   */
  async getStudentLogbooks(lecturerId: string, studentUserId: string) {
    return await this.monitoringRepo.getStudentLogbooksForLecturer(lecturerId, studentUserId);
  }

  /**
   * Check for students who haven't filled logbooks for a while
   * (Placeholder logic for reminder system)
   */
  async getInactiveStudents(lecturerId: string, daysThreshold: number = 3) {
    const mentees = await this.monitoringRepo.getLecturerMenteesProgress(lecturerId);
    const now = new Date();
    
    return mentees.filter(m => {
      if (!m.stats.lastLogbookDate) return true; // Never filled
      const lastDate = new Date(m.stats.lastLogbookDate);
      const diffDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
      return diffDays >= daysThreshold;
    });
  }
}
