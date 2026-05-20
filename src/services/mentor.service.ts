import { and, eq } from "drizzle-orm";
import { createDbClient, type DbClient } from "@/db";
import { internships } from "@/db/schema";
import {
  MentorRepository,
  CreateAssessmentData,
  UpdateAssessmentData,
} from "@/repositories/mentor.repository";
import { MentorWorkflowRepository } from "@/repositories/mentor-workflow.repository";
import { LogbookRepository } from "@/repositories/logbook.repository";
import { StorageService } from "./storage.service";
import { AuthService } from "./auth.service";
import { MahasiswaService } from "./mahasiswa.service";

export class MentorService {
  private db: DbClient;
  private mentorRepo: MentorRepository;
  private workflowRepo: MentorWorkflowRepository;
  private logbookRepo: LogbookRepository;
  private storageService: StorageService;
  private mahasiswaService: MahasiswaService;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.mentorRepo = new MentorRepository(this.db);
    this.workflowRepo = new MentorWorkflowRepository(this.db);
    this.logbookRepo = new LogbookRepository(this.db);
    this.storageService = new StorageService(this.env);
    this.mahasiswaService = new MahasiswaService(this.env);
  }

  private createServiceError(
    message: string,
    code: string,
    statusCode: number,
  ) {
    const error = new Error(message) as Error & {
      code: string;
      statusCode: number;
    };
    error.code = code;
    error.statusCode = statusCode;
    return error;
  }

  // ─── Profile & Signature ───────────────────────────────────────────────────

  async getProfile(mentorId: string, sessionId: string) {
    // 1. Fetch data from SSO (Master)
    const baseUrl = this.env.SSO_BASE_URL;
    const token = await new AuthService(this.env).getSessionAccessToken(
      sessionId,
    );

    let mentorSso: any = null;
    try {
      const response = await fetch(`${baseUrl}/mentor/${mentorId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          success: boolean;
          data: any;
        };
        mentorSso = payload.data;
      }
    } catch (err) {
      console.warn(
        "[MentorService.getProfile] Failed to fetch mentor from SSO:",
        err,
      );
    }

    return {
      id: mentorId,
      fullName: mentorSso?.fullName || mentorSso?.profile?.fullName || "Mentor",
      email: mentorSso?.email || mentorSso?.profile?.email || "",
      instansi: mentorSso?.instansi || "",
      jabatan: mentorSso?.jabatan || "",
      signatureUrl: null, // Local signatures deleted as per Pola 1
    };
  }

  /**
   * Sync mentor signature from SSO to local DB
   * @deprecated Local signature table deleted
   */
  async syncSignatureFromSso(mentorId: string, sessionId: string) {
    // No-op: Table deleted as per Pola 1 migration
    return;
  }

  async updateSignature(mentorId: string, file: File) {
    throw this.createServiceError(
      "Signature updates are now handled via SSO Proxy.",
      "DEPRECATED",
      410,
    );
  }

  // ─── Mentees ────────────────────────────────────────────────────────────────

  async getMentees(
    mentorProfileId: string,
    identityId: string,
    sessionId: string,
    mentorEmail?: string,
  ) {
    const mentees = await this.mentorRepo.getMentees(
      mentorProfileId,
      identityId,
      mentorEmail,
    );

    // Resolve student details (name, nim, etc) for each mentee
    const enrichedMentees = await Promise.all(
      mentees.map(async (mentee) => {
        try {
          const studentDetail = (await this.mahasiswaService.getMahasiswaById(
            mentee.studentId,
            sessionId,
          )) as any;
          const profile = studentDetail?.profile || studentDetail;

          return {
            ...mentee,
            userId: mentee.studentId,
            nama: profile?.fullName || profile?.name || "-",
            nim: studentDetail?.nim || "-",
            email: profile?.emails?.[0]?.email || "-",
            prodi: studentDetail?.prodi?.nama || profile?.prodi || "-",
            photoUrl: profile?.photoUrl || null,
          };
        } catch (error) {
          return {
            ...mentee,
            userId: mentee.studentId,
            nama: "Mahasiswa",
            nim: "-",
            email: "-",
            prodi: "-",
          };
        }
      }),
    );

    return enrichedMentees;
  }

  async getMenteeById(
    mentorId: string,
    identityId: string,
    studentUserId: string,
    sessionId: string,
    mentorEmail?: string,
  ) {
    const mentee = await this.mentorRepo.getMenteeByStudentId(
      mentorId,
      identityId,
      studentUserId,
      mentorEmail,
    );
    if (!mentee)
      throw this.createServiceError(
        "Student not found or not supervised by this mentor",
        "MENTEE_NOT_FOUND",
        404,
      );

    try {
      const studentDetail = (await this.mahasiswaService.getMahasiswaById(
        studentUserId,
        sessionId,
      )) as any;
      const profile = studentDetail?.profile || studentDetail;

      return {
        ...mentee,
        nama: profile?.fullName || profile?.name || "-",
        nim: studentDetail?.nim || "-",
        email: profile?.emails?.[0]?.email || "-",
        prodi: studentDetail?.prodi?.nama || profile?.prodi || "-",
        photoUrl: profile?.photoUrl || null,
      };
    } catch (error) {
      return {
        ...mentee,
        nama: "Mahasiswa",
        nim: "-",
        email: "-",
        prodi: "-",
      };
    }
  }

  // ─── Logbooks ───────────────────────────────────────────────────────────────

  async getStudentLogbooks(
    mentorId: string,
    identityId: string,
    studentUserId: string,
    sessionId: string,
    mentorEmail?: string,
  ) {
    const internshipId = await this.mentorRepo.getInternshipIdForMentee(
      mentorId,
      identityId,
      studentUserId,
      mentorEmail,
    );
    if (!internshipId)
      throw this.createServiceError(
        "Student not found or not supervised by this mentor",
        "INTERNSHIP_NOT_FOUND",
        404,
      );
    const entries = await this.logbookRepo.findByInternshipId(internshipId);

    const enrichedEntries = entries.map((entry) => {
      const proxiedUrl = entry.fileUrl
        ? this.storageService.getAssetProxyUrl(entry.fileUrl)
        : null;
      return {
        ...entry,
        fileUrl: proxiedUrl,
        photoUrl: proxiedUrl,
      };
    });

    return { internshipId, entries: enrichedEntries };
  }

  async approveLogbook(
    mentorId: string,
    identityId: string,
    logbookId: string,
    sessionId: string,
    mentorEmail?: string,
  ) {
    const entry = await this.logbookRepo.findById(logbookId);
    if (!entry)
      throw this.createServiceError(
        "Logbook entry not found",
        "LOGBOOK_NOT_FOUND",
        404,
      );
    await this.assertLogbookBelongsToMentor(
      mentorId,
      identityId,
      entry.internshipId,
      sessionId,
      mentorEmail,
    );
    return this.logbookRepo.approve(logbookId, mentorId);
  }

  async rejectLogbook(
    mentorId: string,
    identityId: string,
    logbookId: string,
    rejectionReason: string,
    sessionId: string,
    mentorEmail?: string,
  ) {
    if (!rejectionReason?.trim())
      throw new Error("Rejection reason is required");
    const entry = await this.logbookRepo.findById(logbookId);
    if (!entry)
      throw this.createServiceError(
        "Logbook entry not found",
        "LOGBOOK_NOT_FOUND",
        404,
      );
    await this.assertLogbookBelongsToMentor(
      mentorId,
      identityId,
      entry.internshipId,
      sessionId,
      mentorEmail,
    );
    return this.logbookRepo.reject(logbookId, mentorId, rejectionReason);
  }

  async approveAllLogbooks(
    mentorId: string,
    identityId: string,
    studentUserId: string,
    sessionId: string,
    mentorEmail?: string,
  ) {
    const internshipId = await this.mentorRepo.getInternshipIdForMentee(
      mentorId,
      identityId,
      studentUserId,
      mentorEmail,
    );
    if (!internshipId)
      throw this.createServiceError(
        "Student not found or not supervised by this mentor",
        "INTERNSHIP_NOT_FOUND",
        404,
      );
    await this.logbookRepo.approveAll(internshipId, mentorId);
    return { message: "All pending logbook entries approved", internshipId };
  }

  // ─── Assessments ────────────────────────────────────────────────────────────

  async createAssessment(
    mentorId: string,
    identityId: string,
    data: CreateAssessmentData,
    sessionId: string,
  ) {
    let internshipId: string | undefined = data.internshipId;

    if (!internshipId && data.studentUserId) {
      const resolvedId = await this.mentorRepo.getInternshipIdForMentee(
        mentorId,
        identityId,
        data.studentUserId,
      );
      internshipId = resolvedId || undefined;
    }

    if (!internshipId) {
      throw this.createServiceError(
        "Internship ID or Student User ID is required",
        "INVALID_INPUT",
        400,
      );
    }

    const existing =
      await this.mentorRepo.getAssessmentByInternshipId(internshipId);
    if (existing)
      throw new Error(
        "Assessment already exists for this student. Use PUT to update it.",
      );

    this.validateScores(data);

    return this.mentorRepo.createAssessment(mentorId, {
      internshipId,
      kehadiran: data.kehadiran,
      kerjasama: data.kerjasama,
      sikapEtika: data.sikapEtika,
      prestasiKerja: data.prestasiKerja,
      kreatifitas: data.kreatifitas,
      components: data.components,
      feedback: data.feedback,
    });
  }

  async getAssessmentByStudent(
    mentorId: string,
    identityId: string,
    studentUserId: string,
    sessionId: string,
  ) {
    const internshipId = await this.mentorRepo.getInternshipIdForMentee(
      mentorId,
      identityId,
      studentUserId,
    );
    if (!internshipId)
      throw this.createServiceError(
        "Student not found or not supervised by this mentor",
        "INTERNSHIP_NOT_FOUND",
        404,
      );

    return this.mentorRepo.getAssessmentByInternshipId(internshipId);
  }

  async getAssessmentByStudentIdOnly(studentUserId: string) {
    const internshipId =
      await this.mentorRepo.getInternshipIdByStudentId(studentUserId);
    if (!internshipId) return null;

    return this.mentorRepo.getAssessmentByInternshipId(internshipId);
  }

  async updateAssessment(
    mentorId: string,
    assessmentId: string,
    data: UpdateAssessmentData,
  ) {
    const existing = await this.mentorRepo.findAssessmentById(assessmentId);
    if (!existing) throw new Error("Assessment not found");
    if (existing.pembimbingLapanganId !== mentorId)
      throw new Error("Access denied");

    if (existing.isLocked) {
      throw new Error("Assessment is locked. Please unlock it first to edit.");
    }

    this.validateScores({
      kehadiran: data.kehadiran ?? existing.kehadiran,
      kerjasama: data.kerjasama ?? existing.kerjasama,
      sikapEtika: data.sikapEtika ?? existing.sikapEtika,
      prestasiKerja: data.prestasiKerja ?? existing.prestasiKerja,
      kreatifitas: data.kreatifitas ?? existing.kreatifitas,
      components: data.components ?? (existing.components as any[]),
    });

    return this.mentorRepo.updateAssessment(assessmentId, data);
  }

  async unlockAssessment(mentorId: string, assessmentId: string) {
    const existing = await this.mentorRepo.findAssessmentById(assessmentId);
    if (!existing) throw new Error("Assessment not found");
    if (existing.pembimbingLapanganId !== mentorId)
      throw new Error("Access denied");

    return this.mentorRepo.unlockAssessment(assessmentId);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async assertLogbookBelongsToMentor(
    mentorId: string,
    identityId: string,
    internshipId: string,
    sessionId: string,
    mentorEmail?: string,
  ) {
    const mentees = await this.getMentees(
      mentorId,
      identityId,
      sessionId,
      mentorEmail,
    );
    const owns = mentees.some((m) => m.internshipId === internshipId);
    if (!owns)
      throw new Error("Access denied: Logbook does not belong to your mentee");
  }

  private validateScores(scores: {
    kehadiran: number;
    kerjasama: number;
    sikapEtika: number;
    prestasiKerja: number;
    kreatifitas: number;
    components?: any[];
  }) {
    if (scores.components && scores.components.length > 0) {
      for (const comp of scores.components) {
        const score = Number(comp.score);
        if (isNaN(score) || score < 0 || score > (comp.maxScore || 100)) {
          throw new Error(
            `Score for '${comp.name || "Kategori"}' must be between 0 and ${comp.maxScore || 100}`,
          );
        }
      }
      return;
    }

    const fields = [
      "kehadiran",
      "kerjasama",
      "sikapEtika",
      "prestasiKerja",
      "kreatifitas",
    ] as const;
    for (const field of fields) {
      const v = scores[field];
      if (v < 0 || v > 100)
        throw new Error(`Score for '${field}' must be between 0 and 100`);
    }
  }
}
