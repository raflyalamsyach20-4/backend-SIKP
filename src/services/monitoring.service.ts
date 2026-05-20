import { createDbClient } from "@/db";
import { MonitoringRepository } from "@/repositories/monitoring.repository";
import { MahasiswaService } from "./mahasiswa.service";

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
    // Proactively sync to ensure all team members are linked to the leader's Dosen PA
    console.log(
      `[MonitoringService.getMenteesProgress] Syncing mentees for ${lecturerId}...`,
    );
    await this.syncMenteesProgress(lecturerId, sessionId);

    const mentees =
      await this.monitoringRepo.getLecturerMenteesProgress(lecturerId);

    const enriched = await Promise.all(
      mentees.map(async (m) => {
        const profile = await this.mahasiswaService.getMahasiswaById(
          m.mahasiswaId,
          sessionId,
        );

        // Self-healing: If dosenPaId is missing in DB but available in SSO, backfill it
        if (!m.dosenPaId && profile?.dosenPA?.profile?.id) {
          try {
            await this.monitoringRepo.updateDosenPaId(
              m.internshipId,
              profile.dosenPA.profile.id,
            );
          } catch (err) {
            console.error(
              `[MonitoringService.getMenteesProgress] Failed to backfill dosenPaId for ${m.internshipId}:`,
              err,
            );
          }
        }

        return {
          ...m,
          studentName: profile?.profile.fullName || "N/A",
          nim: profile?.nim || "N/A",
          programStudi: profile?.prodi?.nama || "N/A",
          mentorName: m.mentorName || null,
        };
      }),
    );

    return enriched;
  }

  /**
   * Get logbooks for a specific student supervisee
   */
  async getStudentLogbooks(
    lecturerId: string,
    studentUserId: string,
    sessionId: string,
  ) {
    const rawData = await this.monitoringRepo.getStudentLogbooksForLecturer(
      lecturerId,
      studentUserId,
    );

    if (!rawData || rawData.length === 0) {
      // Try to get profile anyway to return empty state gracefully
      const profile = (await this.mahasiswaService.getMahasiswaById(
        studentUserId,
        sessionId,
      )) as any;
      return {
        studentId: studentUserId,
        studentName: profile?.profile?.fullName || "Unknown",
        nim: profile?.nim || "Unknown",
        programStudi: profile?.prodi?.nama || "Unknown",
        company: "Unknown",
        division: "Unknown",
        startDate: null,
        endDate: null,
        logbooks: [],
      };
    }

    const firstRow = rawData[0];

    // Format logbooks
    const formattedLogbooks = rawData.map((row) => ({
      id: row.logbook.id,
      date: row.logbook.date,
      activity: row.logbook.activity,
      status: row.logbook.status,
      hours: row.logbook.hours,
      rejectionReason: row.logbook.rejectionReason,
      photoUrl: row.logbook.fileUrl,
      mentorName: row.mentorName || "-",
      createdAt: row.logbook.createdAt,
      verifiedAt: row.logbook.verifiedAt,
    }));

    const profile = (await this.mahasiswaService.getMahasiswaById(
      studentUserId,
      sessionId,
    )) as any;

    return {
      studentId: studentUserId,
      studentName: profile?.profile?.fullName || "Unknown",
      nim: profile?.nim || "Unknown",
      email:
        profile?.profile?.emails?.find((e: any) => e.isPrimary)?.email || null,
      programStudi: profile?.prodi?.nama || "Unknown",
      company: firstRow.internship.companyName,
      division: firstRow.internship.division || "-",
      startDate: firstRow.internship.startDate,
      endDate: firstRow.internship.endDate,
      logbooks: formattedLogbooks,
    };
  }

  /**
   * Check for students who haven't filled logbooks for a while
   * (Placeholder logic for reminder system)
   */
  async getInactiveStudents(
    lecturerId: string,
    sessionId: string,
    daysThreshold: number = 3,
  ) {
    // Use the enriched list from getMenteesProgress to ensure auto-sync and consistency
    const enrichedMentees = await this.getMenteesProgress(
      lecturerId,
      sessionId,
    );
    const now = new Date();

    return enrichedMentees.filter((m) => {
      if (!m.stats.lastLogbookDate) return true; // Never filled
      const lastDate = new Date(m.stats.lastLogbookDate);
      const diffDays = Math.floor(
        (now.getTime() - lastDate.getTime()) / (1000 * 3600 * 24),
      );
      return diffDays >= daysThreshold;
    });
  }

  /**
   * Proactively sync all active internships where the lecturer is the Dosen PA
   * This helps backfill dosenPaId for existing records.
   */
  async syncMenteesProgress(lecturerId: string, sessionId: string) {
    console.log(
      `[MonitoringService.syncMenteesProgress] Starting team-based sync for lecturerId: ${lecturerId}`,
    );
    const allActive = await this.monitoringRepo.getAllActiveInternships();

    console.log(
      `[MonitoringService.syncMenteesProgress] Found ${allActive.length} total active internships to check`,
    );
    let syncCount = 0;

    // Cache for leader's Dosen PA to avoid redundant SSO calls
    const leaderPaCache = new Map<string, string | null>();

    for (const internship of allActive) {
      // Skip if already linked to this lecturer as PA or KP
      if (
        internship.dosenPaId === lecturerId ||
        internship.dosenPembimbingId === lecturerId
      ) {
        // Even if already linked, we might want to ensure it's correct,
        // but for now let's focus on missing links or unassigned ones.
        if (internship.dosenPaId === lecturerId) continue;
      }

      try {
        // 1. Find the team and the leader for this internship
        const team = await this.monitoringRepo.getTeamById(internship.teamId!);
        if (!team) continue;

        const leaderId = team.leaderMahasiswaId;

        // 2. Get leader's Dosen PA (Master PA for the team)
        let masterPaId = leaderPaCache.get(leaderId);
        if (masterPaId === undefined) {
          const leaderProfile = await this.mahasiswaService.getMahasiswaById(
            leaderId,
            sessionId,
          );
          masterPaId =
            leaderProfile?.dosenPA?.profile?.id ||
            leaderProfile?.dosenPA?.id ||
            null;
          leaderPaCache.set(leaderId, masterPaId);
        }

        // 3. If the leader's Dosen PA matches the current lecturer, update the member's record
        if (masterPaId === lecturerId) {
          console.log(
            `[MonitoringService.syncMenteesProgress] MATCH FOUND (Team Leader PA). Student: ${internship.mahasiswaId}, Leader: ${leaderId}, Master PA: ${masterPaId}`,
          );
          await this.monitoringRepo.updateDosenPaId(internship.id, lecturerId);
          syncCount++;
        }
      } catch (err) {
        console.error(
          `[MonitoringService.syncMenteesProgress] Failed to sync internship ${internship.id}:`,
          err,
        );
      }
    }

    console.log(
      `[MonitoringService.syncMenteesProgress] Sync finished. Total synced: ${syncCount}`,
    );
    return { synced: syncCount };
  }
}
