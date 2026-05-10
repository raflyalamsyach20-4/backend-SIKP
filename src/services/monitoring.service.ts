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
        
        // Self-healing: If dosenPaId is missing in DB but available in SSO, backfill it
        if (!m.dosenPaId && profile?.dosenPA?.profile?.id) {
          try {
            await this.monitoringRepo.updateDosenPaId(m.internshipId, profile.dosenPA.profile.id);
          } catch (err) {
            console.error(`[MonitoringService.getMenteesProgress] Failed to backfill dosenPaId for ${m.internshipId}:`, err);
          }
        }

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
  async getStudentLogbooks(lecturerId: string, studentUserId: string, sessionId: string) {
    const rawData = await this.monitoringRepo.getStudentLogbooksForLecturer(lecturerId, studentUserId);
    
    if (!rawData || rawData.length === 0) {
      // Try to get profile anyway to return empty state gracefully
      const profile = await this.mahasiswaService.getMahasiswaById(studentUserId, sessionId) as any;
      return {
        studentId: studentUserId,
        studentName: profile?.profile?.fullName || 'Unknown',
        nim: profile?.nim || 'Unknown',
        programStudi: profile?.prodi?.nama || 'Unknown',
        company: 'Unknown',
        division: 'Unknown',
        startDate: null,
        endDate: null,
        logbooks: [],
      };
    }

    const firstRow = rawData[0];

    // Format logbooks
    const formattedLogbooks = rawData.map(row => ({
      id: row.logbook.id,
      date: row.logbook.date,
      activity: row.logbook.activity,
      status: row.logbook.status,
      hours: row.logbook.hours,
      rejectionReason: row.logbook.rejectionReason,
      photoUrl: row.logbook.fileUrl,
      mentorName: row.mentorName || '-',
      createdAt: row.logbook.createdAt,
      verifiedAt: row.logbook.verifiedAt,
    }));

    const profile = await this.mahasiswaService.getMahasiswaById(studentUserId, sessionId) as any;

    return {
      studentId: studentUserId,
      studentName: profile?.profile?.fullName || 'Unknown',
      nim: profile?.nim || 'Unknown',
      email: profile?.profile?.emails?.find((e: any) => e.isPrimary)?.email || null,
      programStudi: profile?.prodi?.nama || 'Unknown',
      company: firstRow.internship.companyName,
      division: firstRow.internship.division || '-',
      startDate: firstRow.internship.startDate,
      endDate: firstRow.internship.endDate,
      logbooks: formattedLogbooks,
    };
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

  /**
   * Proactively sync all active internships where the lecturer is the Dosen PA
   * This helps backfill dosenPaId for existing records.
   */
  async syncMenteesProgress(lecturerId: string, sessionId: string) {
    console.log(`[MonitoringService.syncMenteesProgress] Starting sync for lecturerId: ${lecturerId}`);
    // 1. Get all active internships that don't have this lecturer as Pembimbing KP
    // (We want to find where they are just the Dosen PA)
    const allActive = await this.monitoringRepo.getAllActiveInternships();
    
    console.log(`[MonitoringService.syncMenteesProgress] Found ${allActive.length} total active internships to check`);
    let syncCount = 0;
    
    await Promise.all(
      allActive.map(async (internship) => {
        // Skip if already linked to this lecturer
        if (internship.dosenPembimbingId === lecturerId || internship.dosenPaId === lecturerId) {
          return;
        }

        const profile = await this.mahasiswaService.getMahasiswaById(internship.mahasiswaId, sessionId);
        const dosenPaSso = profile?.dosenPA;
        
        if (dosenPaSso) {
          const ssoPaId = dosenPaSso.profile?.id || dosenPaSso.id;
          console.log(`[MonitoringService.syncMenteesProgress] Student: ${profile?.nim}, SSO DosenPA ID: ${ssoPaId}, Target LecturerID: ${lecturerId}`);
          
          if (ssoPaId === lecturerId) {
            console.log(`[MonitoringService.syncMenteesProgress] MATCH FOUND for student ${profile?.nim}. Updating DB...`);
            await this.monitoringRepo.updateDosenPaId(internship.id, lecturerId);
            syncCount++;
          }
        }
      })
    );

    console.log(`[MonitoringService.syncMenteesProgress] Sync finished. Total synced: ${syncCount}`);
    return { synced: syncCount };
  }
}
