import { createDbClient } from "@/db";
import { eq } from "drizzle-orm";
import { internships } from "@/db/schema";
import { MonitoringRepository } from "@/repositories/monitoring.repository";
import { MahasiswaService } from "./mahasiswa.service";
import { StorageService } from "./storage.service";
import { InternshipDocumentService } from "./internship-document.service";
import { zipSync } from "fflate";

export class MonitoringService {
  private db: ReturnType<typeof createDbClient>;
  private monitoringRepo: MonitoringRepository;
  private mahasiswaService: MahasiswaService;
  private storageService: StorageService;
  private documentService: InternshipDocumentService;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.monitoringRepo = new MonitoringRepository(this.db);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.storageService = new StorageService(this.env);
    this.documentService = new InternshipDocumentService(this.env);
  }

  private static LOGBOOK_PDF_VERSION = 5;

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
      photoUrl: row.logbook.fileUrl
        ? this.storageService.getAssetProxyUrl(row.logbook.fileUrl)
        : null,
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

  private buildSafeFileName(value: string) {
    const normalized = value
      .replace(/[^a-zA-Z0-9-_ ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s/g, "_");

    return normalized || "logbook";
  }

  private async readStorageObject(
    object: R2ObjectBody | { body?: any; httpMetadata?: any } | null,
  ): Promise<Buffer | null> {
    if (!object) return null;

    if ("arrayBuffer" in object && typeof object.arrayBuffer === "function") {
      const arrayBuffer = await object.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    if ("body" in object && object.body) {
      const arrayBuffer = await new Response(object.body).arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    return null;
  }

  private async getOrCreateLogbookPdf(
    internshipId: string,
    sessionId: string,
    fileName: string,
  ) {
    const [cached] = await this.db
      .select({
        logbookPdfKey: internships.logbookPdfKey,
        logbookPdfUrl: internships.logbookPdfUrl,
        logbookPdfVersion: internships.logbookPdfVersion,
      })
      .from(internships)
      .where(eq(internships.id, internshipId))
      .limit(1);

    if (
      cached?.logbookPdfKey &&
      cached.logbookPdfVersion === MonitoringService.LOGBOOK_PDF_VERSION
    ) {
      const stored = await this.storageService.getFile(cached.logbookPdfKey);
      const buffer = await this.readStorageObject(stored as any);
      if (buffer) return buffer;
    }

    const buffer = await this.documentService.generateLogbookByInternshipId(
      internshipId,
      sessionId,
      { format: "pdf", withSignature: true },
    );

    const upload = await this.storageService.uploadBuffer(
      buffer,
      fileName,
      "logbooks",
      "application/pdf",
    );

    await this.db
      .update(internships)
      .set({
        logbookPdfUrl: upload.url,
        logbookPdfKey: upload.key,
        logbookPdfGeneratedAt: new Date(),
        logbookPdfVersion: MonitoringService.LOGBOOK_PDF_VERSION,
        updatedAt: new Date(),
      })
      .where(eq(internships.id, internshipId));

    return buffer;
  }

  async exportLogbookZip(lecturerId: string, sessionId: string) {
    const mentees = await this.getMenteesProgress(lecturerId, sessionId);
    const files: Record<string, Uint8Array> = {};

    for (const mentee of mentees) {
      if (!mentee.internshipId) continue;

      const baseName = this.buildSafeFileName(
        `${mentee.nim || ""}_${mentee.studentName || ""}`,
      );
      let fileName = `${baseName}.pdf`;
      if (files[fileName]) {
        fileName = `${baseName}_${mentee.internshipId.slice(0, 8)}.pdf`;
      }

      const buffer = await this.getOrCreateLogbookPdf(
        mentee.internshipId,
        sessionId,
        fileName,
      );

      files[fileName] = new Uint8Array(buffer);
    }

    if (Object.keys(files).length === 0) {
      throw new Error("Tidak ada logbook untuk diexport.");
    }

    const zipBytes = zipSync(files, { level: 0 });
    const zipBuffer = Buffer.from(zipBytes);
    const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fileName = `logbook_pa_${dateTag}.zip`;

    return { buffer: zipBuffer, fileName };
  }
}
