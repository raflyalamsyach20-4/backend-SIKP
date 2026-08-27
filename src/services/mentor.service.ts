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
import { SsoSignatureProxyService } from "./sso-signature-proxy.service";
import { InternshipDocumentService } from "./internship-document.service";

export class MentorService {
  private db: DbClient;
  private mentorRepo: MentorRepository;
  private workflowRepo: MentorWorkflowRepository;
  private logbookRepo: LogbookRepository;
  private storageService: StorageService;
  private mahasiswaService: MahasiswaService;
  private ssoSignatureProxyService: SsoSignatureProxyService;
  private documentService: InternshipDocumentService;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.mentorRepo = new MentorRepository(this.db);
    this.workflowRepo = new MentorWorkflowRepository(this.db);
    this.logbookRepo = new LogbookRepository(this.db);
    this.storageService = new StorageService(this.env);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.ssoSignatureProxyService = new SsoSignatureProxyService(this.env);
    this.documentService = new InternshipDocumentService(this.env);
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

    // Cache TTD mentor saat pertama kali approve (non-blocking)
    this.cacheMentorSignatureIfMissing(
      entry.internshipId,
      sessionId,
    ).catch((err) =>
      console.warn(
        "[MentorService.approveLogbook] Gagal cache TTD mentor (non-critical):",
        err,
      ),
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

    // Cache TTD mentor setelah approve semua (non-blocking)
    this.cacheMentorSignatureIfMissing(
      internshipId,
      sessionId,
    ).catch((err) =>
      console.warn(
        "[MentorService.approveAllLogbooks] Gagal cache TTD mentor (non-critical):",
        err,
      ),
    );

    this.cacheLogbookPdfIfReady(internshipId, sessionId).catch((err) =>
      console.warn(
        "[MentorService.approveAllLogbooks] Gagal cache PDF logbook (non-critical):",
        err,
      ),
    );

    return { message: "All pending logbook entries approved", internshipId };
  }

  private async cacheLogbookPdfIfReady(
    internshipId: string,
    sessionId: string,
  ) {
    const isFull = await this.documentService.isLogbookFull(internshipId);
    if (!isFull) return;

    const buffer = await this.documentService.generateLogbookByInternshipId(
      internshipId,
      sessionId,
      { format: "pdf", withSignature: true },
    );

    const { url, key } = await this.storageService.uploadBuffer(
      buffer,
      `logbook-${internshipId}.pdf`,
      "logbooks",
      "application/pdf",
    );

    await this.db
      .update(internships)
      .set({
        logbookPdfUrl: url,
        logbookPdfKey: key,
        logbookPdfGeneratedAt: new Date(),
        logbookPdfVersion: 4,
        updatedAt: new Date(),
      })
      .where(eq(internships.id, internshipId));
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

    const assessment = await this.mentorRepo.createAssessment(mentorId, {
      internshipId,
      kehadiran: data.kehadiran,
      kerjasama: data.kerjasama,
      sikapEtika: data.sikapEtika,
      prestasiKerja: data.prestasiKerja,
      kreatifitas: data.kreatifitas,
      components: data.components,
      feedback: data.feedback,
    });

    this.cacheMentorSignatureIfMissing(internshipId, sessionId).catch((err) =>
      console.warn(
        "[MentorService.createAssessment] Gagal cache TTD mentor (non-critical):",
        err,
      ),
    );

    return assessment;
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
    sessionId: string,
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

    const updated = await this.mentorRepo.updateAssessment(assessmentId, data);

    this.cacheMentorSignatureIfMissing(
      existing.internshipId,
      sessionId,
    ).catch((err) =>
      console.warn(
        "[MentorService.updateAssessment] Gagal cache TTD mentor (non-critical):",
        err,
      ),
    );

    return updated;
  }

  async unlockAssessment(mentorId: string, assessmentId: string) {
    const existing = await this.mentorRepo.findAssessmentById(assessmentId);
    if (!existing) throw new Error("Assessment not found");
    if (existing.pembimbingLapanganId !== mentorId)
      throw new Error("Access denied");

    return this.mentorRepo.unlockAssessment(assessmentId);
  }

  // ─── Mentor Signature Cache ────────────────────────────────────────────────

  /**
   * Simpan TTD mentor langsung dari base64 yang dikirim frontend.
   * Frontend sudah fetch dari SSO sendiri (via getActiveProfileSignature),
   * lalu kirim base64-nya ke endpoint ini → langsung disimpan ke DB.
   *
   * @param internshipId  - ID internship yang akan diberi cache TTD
   * @param signatureBase64 - Data TTD dalam format base64 (tanpa prefix data:mime;base64,)
   * @param mimeType      - MIME type TTD (image/png, image/svg+xml, dll). Default: image/png
   */
  async saveSignatureDirectly(
    internshipId: string,
    signatureBase64: string,
    mimeType = "image/png",
  ): Promise<{ internshipId: string; mimeType: string; cachedAt: Date }> {
    if (!signatureBase64?.trim()) {
      throw this.createServiceError(
        "Data tanda tangan (base64) tidak boleh kosong.",
        "INVALID_SIGNATURE",
        400,
      );
    }

    // Strip data URL prefix jika frontend mengirim dengan format "data:image/png;base64,..."
    let cleanBase64 = signatureBase64.trim();
    if (cleanBase64.startsWith("data:")) {
      const commaIdx = cleanBase64.indexOf(",");
      if (commaIdx !== -1) {
        // Ekstrak mime dari header
        const header = cleanBase64.substring(0, commaIdx);
        const mimeMatch = header.match(/data:([^;]+);/);
        if (mimeMatch) mimeType = mimeMatch[1];
        cleanBase64 = cleanBase64.substring(commaIdx + 1);
      }
    }

    // Validasi panjang minimum (TTD valid tidak mungkin sangat pendek)
    if (cleanBase64.length < 100) {
      throw this.createServiceError(
        "Data tanda tangan terlalu pendek / tidak valid.",
        "INVALID_SIGNATURE",
        400,
      );
    }

    // Cek internship exists
    const rows = await this.db
      .select({ id: internships.id })
      .from(internships)
      .where(eq(internships.id, internshipId))
      .limit(1);

    if (!rows[0]) {
      throw this.createServiceError(
        `Internship dengan ID ${internshipId} tidak ditemukan.`,
        "INTERNSHIP_NOT_FOUND",
        404,
      );
    }

    const now = new Date();

    await this.db
      .update(internships)
      .set({
        mentorSignatureBase64: cleanBase64,
        mentorSignatureMimeType: mimeType,
        mentorSignatureCachedAt: now,
        updatedAt: now,
      })
      .where(eq(internships.id, internshipId));

    console.log(
      `[MentorService.saveSignatureDirectly] TTD disimpan untuk internship ${internshipId} (mime=${mimeType}, len=${cleanBase64.length})`,
    );

    return { internshipId, mimeType, cachedAt: now };
  }

  /**
   * Ambil TTD mentor yang sudah di-cache dari DB.
   * Digunakan oleh PDF generator sebagai sumber pertama sebelum fallback ke SSO.
   * Mengembalikan null jika belum pernah di-cache.
   */
  async getCachedMentorSignature(internshipId: string): Promise<{
    base64: string;
    mimeType: string;
    cachedAt: Date;
  } | null> {
    try {
      const rows = await this.db
        .select({
          mentorSignatureBase64: internships.mentorSignatureBase64,
          mentorSignatureMimeType: internships.mentorSignatureMimeType,
          mentorSignatureCachedAt: internships.mentorSignatureCachedAt,
        })
        .from(internships)
        .where(eq(internships.id, internshipId))
        .limit(1);

      const row = rows[0];
      if (
        !row?.mentorSignatureBase64 ||
        !row?.mentorSignatureMimeType ||
        !row?.mentorSignatureCachedAt
      ) {
        return null;
      }

      return {
        base64: row.mentorSignatureBase64,
        mimeType: row.mentorSignatureMimeType,
        cachedAt: row.mentorSignatureCachedAt,
      };
    } catch (err) {
      console.error(
        "[MentorService.getCachedMentorSignature] Error:",
        err,
      );
      return null;
    }
  }

  /**
   * Paksa refresh cache TTD mentor dari SSO, lalu simpan ke DB.
   * Berguna jika mentor memperbarui TTD di SSO.
   */
  async refreshMentorSignatureCache(
    internshipId: string,
    sessionId: string,
  ): Promise<boolean> {
    return this.cacheMentorSignatureIfMissing(internshipId, sessionId, true);
  }

  /**
   * Fetch TTD mentor dari SSO dan simpan ke kolom mentor_signature_base64
   * di tabel internships. Hanya update jika belum ada (atau force=true).
   */
  private async cacheMentorSignatureIfMissing(
    internshipId: string,
    sessionId: string,
    force = false,
  ): Promise<boolean> {
    try {
      // 1. Cek apakah sudah ada cache (skip jika ada dan tidak di-force)
      if (!force) {
        const existing = await this.getCachedMentorSignature(internshipId);
        if (existing) {
          console.log(
            `[MentorService.cacheMentorSignatureIfMissing] Cache sudah ada untuk internship ${internshipId}, skip.`,
          );
          return true;
        }
      }

      // 2. Fetch TTD aktif mentor dari SSO
      const activeSignature =
        await this.ssoSignatureProxyService.getActiveSignature(sessionId);

      if (!activeSignature) {
        console.warn(
          `[MentorService.cacheMentorSignatureIfMissing] Tidak dapat mengambil TTD dari SSO untuk internship ${internshipId}.`,
        );
        return false;
      }

      // 3. Resolve sumber gambar TTD (URL atau base64 langsung)
      const signatureSource: string =
        (activeSignature as any).signatureImage ||
        (activeSignature as any).signatureUrl ||
        (activeSignature as any).url ||
        (activeSignature as any).svg ||
        (activeSignature as any).data ||
        "";

      if (!signatureSource) {
        console.warn(
          `[MentorService.cacheMentorSignatureIfMissing] TTD dari SSO kosong untuk internship ${internshipId}.`,
        );
        return false;
      }

      // 4. Konversi ke base64 jika berupa URL atau SVG raw
      let base64Data: string;
      let mimeType: string =
        (activeSignature as any).mimeType || "image/png";

      if (signatureSource.startsWith("data:")) {
        // Sudah format data URL — pisahkan header
        const [header, data] = signatureSource.split(",");
        base64Data = data || "";
        const mimeMatch = header.match(/data:([^;]+);/);
        if (mimeMatch) mimeType = mimeMatch[1];
      } else if (
        signatureSource.trim().startsWith("<svg") ||
        mimeType === "image/svg+xml"
      ) {
        // SVG raw string → encode base64
        base64Data = btoa(unescape(encodeURIComponent(signatureSource)));
        mimeType = "image/svg+xml";
      } else if (
        signatureSource.startsWith("http://") ||
        signatureSource.startsWith("https://")
      ) {
        // URL → fetch dan konversi ke base64
        const resp = await fetch(signatureSource);
        if (!resp.ok) {
          console.warn(
            `[MentorService.cacheMentorSignatureIfMissing] Gagal fetch TTD dari URL ${signatureSource} (${resp.status}).`,
          );
          return false;
        }
        const buffer = await resp.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        base64Data = btoa(binary);
        mimeType =
          resp.headers.get("content-type")?.split(";")[0] || "image/png";
      } else {
        // Asumsikan sudah base64
        base64Data = signatureSource;
      }

      if (!base64Data) {
        console.warn(
          `[MentorService.cacheMentorSignatureIfMissing] base64Data kosong setelah konversi untuk internship ${internshipId}.`,
        );
        return false;
      }

      // 5. Simpan ke DB
      await this.db
        .update(internships)
        .set({
          mentorSignatureBase64: base64Data,
          mentorSignatureMimeType: mimeType,
          mentorSignatureCachedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(internships.id, internshipId));

      console.log(
        `[MentorService.cacheMentorSignatureIfMissing] TTD berhasil di-cache untuk internship ${internshipId} (mimeType=${mimeType}, length=${base64Data.length}).`,
      );
      return true;
    } catch (err) {
      console.error(
        "[MentorService.cacheMentorSignatureIfMissing] Error:",
        err,
      );
      return false;
    }
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
