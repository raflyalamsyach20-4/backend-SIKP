import { createDbClient } from "@/db";
import {
  assessments,
  lecturerAssessments,
  combinedGrades,
  internships,
  assessmentCriteria,
  reports,
  authSessions,
} from "@/db/schema";
import { asc, eq, and, or, sql } from "drizzle-orm";
import { generateId } from "@/utils/helpers";
import { MahasiswaService } from "./mahasiswa.service";
import { DosenService } from "./dosen.service";
import { MentorService } from "./mentor.service";
import { StorageService } from "./storage.service";
import { SsoSignatureProxyService } from "./sso-signature-proxy.service";

export class AssessmentService {
  private db: ReturnType<typeof createDbClient>;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;
  private storageService: StorageService;
  private ssoSignatureProxyService: SsoSignatureProxyService;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.dosenService = new DosenService(this.env);
    this.storageService = new StorageService(this.env);
    this.ssoSignatureProxyService = new SsoSignatureProxyService(this.env);
  }

  async calculateCombinedGrade(
    internshipId: string,
    lecturerAssessmentId: string,
    academicScore: number,
  ) {
    const mentorAssessmentResult = await this.db
      .select()
      .from(assessments)
      .where(eq(assessments.internshipId, internshipId))
      .limit(1);

    const mentorAssessment = mentorAssessmentResult[0];
    const fieldScore = mentorAssessment ? mentorAssessment.totalScore : 0;

    // === RUMUS PERHITUNGAN NILAI AKHIR MAGANG/KP GABUNGAN ===
    // Nilai akhir dihitung dengan menggabungkan dua komponen nilai:
    // 1. Nilai Lapangan (dari Pembimbing Lapangan/Mentor): Bobot 30% (0.3)
    // 2. Nilai Akademis (dari Dosen Pembimbing Akademik): Bobot 70% (0.7)
    // Rumus: Nilai Akhir = (Nilai Lapangan * 30%) + (Nilai Akademis * 70%)
    // Nilai akhir dibulatkan ke bilangan bulat terdekat menggunakan Math.round().
    const finalScore = Math.round(fieldScore * 0.3 + academicScore * 0.7);

    // === ATURAN KONVERSI NILAI ANGKA KE HURUF (LETTER GRADE) ===
    // Konversi nilai akhir (angka) menjadi nilai huruf mengikuti standar:
    // - Nilai Akhir >= 80  => A
    // - Nilai Akhir >= 70  => B
    // - Nilai Akhir >= 60  => C
    // - Nilai Akhir >= 50  => D
    // - Nilai Akhir < 50   => E (Gagal)
    let letterGrade = "E";
    if (finalScore >= 80) letterGrade = "A";
    else if (finalScore >= 70) letterGrade = "B";
    else if (finalScore >= 60) letterGrade = "C";
    else if (finalScore >= 50) letterGrade = "D";

    await this.db
      .insert(combinedGrades)
      .values({
        id: generateId(),
        internshipId,
        assessmentId: mentorAssessment?.id || null,
        lecturerAssessmentId,
        fieldScore,
        academicScore,
        finalScore,
        letterGrade,
        status: "PENDING",
        calculatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: combinedGrades.internshipId,
        set: {
          assessmentId: mentorAssessment?.id || null,
          lecturerAssessmentId,
          fieldScore,
          academicScore,
          finalScore,
          letterGrade,
          status: "PENDING",
          calculatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    await this.db
      .update(internships)
      .set({ status: "SELESAI", updatedAt: new Date() })
      .where(eq(internships.id, internshipId));

    return { finalScore, letterGrade };
  }

  async getAssessmentRecap(internshipId: string, sessionId?: string) {
    const [combined, mentorScore, lecturerScore, internshipRows, reportRows] =
      await Promise.all([
        this.db
          .select()
          .from(combinedGrades)
          .where(eq(combinedGrades.internshipId, internshipId))
          .limit(1),
        this.db
          .select()
          .from(assessments)
          .where(eq(assessments.internshipId, internshipId))
          .limit(1),
        this.db
          .select()
          .from(lecturerAssessments)
          .where(eq(lecturerAssessments.internshipId, internshipId))
          .limit(1),
        this.db
          .select()
          .from(internships)
          .where(eq(internships.id, internshipId))
          .limit(1),
        this.db
          .select()
          .from(reports)
          .where(eq(reports.internshipId, internshipId))
          .limit(1),
      ]);

    const internship = internshipRows[0] || null;
    let studentProfile = null;
    let dosenProfile = null;

    if (internship?.mahasiswaId && sessionId) {
      studentProfile = await this.mahasiswaService.getMahasiswaById(
        internship.mahasiswaId,
        sessionId,
      );
    }

    if (internship?.dosenPembimbingId && sessionId) {
      dosenProfile = await this.dosenService.getDosenById(
        internship.dosenPembimbingId,
        sessionId,
      );
    }

    return {
      student: internship
        ? {
            id: internship.mahasiswaId,
            name: studentProfile?.profile.fullName || "-",
            nim: studentProfile?.nim || "-",
            prodi: studentProfile?.prodi?.nama || studentProfile?.prodi || "-",
            fakultas: (studentProfile as any)?.fakultas || "Ilmu Komputer",
          }
        : null,
      companyName: internship?.companyName || null,
      startDate: internship?.startDate || null,
      endDate: internship?.endDate || null,
      lecturer: dosenProfile
        ? {
            id: internship?.dosenPembimbingId,
            name: dosenProfile.profile.fullName,
            nip: (dosenProfile as any).nip || (dosenProfile as any).nidn || "-",
            signature: null,
          }
        : null,
      coordinator: null,
      mentor: mentorScore[0] || null,
      lecturerScore: lecturerScore[0] || null,
      combined: combined[0] || null,
      report: reportRows[0] || null,
      summary: {
        isVerifiedByKaprodi: combined[0]?.isVerifiedByKaprodi || false,
        status: combined[0]?.status || "PENDING",
        finalScore: combined[0]?.finalScore || 0,
        grade: combined[0]?.letterGrade || "-",
        fieldSupervisorTotal: mentorScore[0]?.totalScore || 0,
        academicSupervisorTotal: lecturerScore[0]?.totalScore || 0,
      },
    };
  }

  async getCriteria(type: "MENTOR" | "DOSEN_PA") {
    return this.db
      .select()
      .from(assessmentCriteria)
      .where(eq(assessmentCriteria.type, type))
      .orderBy(
        asc(assessmentCriteria.sortOrder),
        asc(assessmentCriteria.label),
      );
  }

  async replaceCriteria(type: "MENTOR" | "DOSEN_PA", criteria: any[]) {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .delete(assessmentCriteria)
        .where(eq(assessmentCriteria.type, type));
      if (criteria.length === 0) return;
      const values = criteria.map((item, index) => ({
        id: item.id || generateId(),
        type,
        categoryId: item.categoryId || generateId(),
        categoryKey: (item.category || "cat")
          .toLowerCase()
          .replace(/\s+/g, "_"),
        label: item.label || "Kategori",
        weight: Number(item.weight) || 0,
        maxScore: Number(item.maxScore) || 100,
        sortOrder: index + 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }));
      await tx.insert(assessmentCriteria).values(values);
    });
  }

  async generateLecturerAssessmentPDF(internshipId: string, sessionId: string) {
    const result = await this.db
      .select({
        internship: internships,
        lecturerScore: lecturerAssessments,
      })
      .from(internships)
      .innerJoin(
        lecturerAssessments,
        eq(internships.id, lecturerAssessments.internshipId),
      )
      .where(eq(internships.id, internshipId))
      .limit(1);

    if (result.length === 0) throw new Error("Penilaian dosen tidak ditemukan");
    const data = result[0];

    const studentSso = await this.mahasiswaService.getMahasiswaById(
      data.internship.mahasiswaId,
      sessionId,
    );
    const dosenSso = await this.dosenService.getDosenById(
      data.lecturerScore.dosenId,
      sessionId,
    );

    const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let currentY = height - 50;
    page.drawText("FORM PENILAIAN DOSEN PEMBIMBING AKADEMIK", {
      x: 100,
      y: currentY,
      size: 14,
      font: fontBold,
    });
    currentY -= 60;
    page.drawText(`Nama Mahasiswa : ${studentSso?.profile.fullName || "N/A"}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: fontNormal,
    });
    currentY -= 15;
    page.drawText(`NIM            : ${studentSso?.nim || "N/A"}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: fontNormal,
    });
    currentY -= 40;

    // Simplified Table
    page.drawText("Total Skor (70%)", {
      x: 50,
      y: currentY,
      size: 12,
      font: fontBold,
    });
    page.drawText(data.lecturerScore.totalScore.toString(), {
      x: 400,
      y: currentY,
      size: 12,
      font: fontBold,
    });

    currentY -= 100;
    page.drawText("Dosen Pembimbing Akademik,", {
      x: 50,
      y: currentY + 60,
      size: 10,
      font: fontNormal,
    });
    page.drawText(dosenSso?.profile.fullName || "", {
      x: 50,
      y: currentY,
      size: 10,
      font: fontBold,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  async generateGradeRecapPDF(internshipId: string, sessionId: string) {
    const result = await this.db
      .select({
        internship: internships,
        combined: combinedGrades,
      })
      .from(internships)
      .leftJoin(combinedGrades, eq(internships.id, combinedGrades.internshipId))
      .where(eq(internships.id, internshipId))
      .limit(1);

    if (result.length === 0) throw new Error("Data magang tidak ditemukan");
    const data = result[0];
    const studentSso = await this.mahasiswaService.getMahasiswaById(
      data.internship.mahasiswaId,
      sessionId,
    );

    const PDFDocument = (await import("pdfkit")).default;
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("REKAPITULASI NILAI AKHIR KP", { align: "center" });
      doc.moveDown();
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(`Nama: ${studentSso?.profile.fullName || "N/A"}`);
      doc.text(`Nilai Akhir: ${data.combined?.finalScore || "-"}`);
      doc.end();
    });
  }

  async verifyLecturerAssessment(
    assessmentId: string,
    coordinatorId: string,
    sessionId: string,
  ) {
    await this.db
      .update(lecturerAssessments)
      .set({
        isVerifiedByKaprodi: true,
        verifiedByKaprodiId: coordinatorId,
        status: "APPROVED",
        updatedAt: new Date(),
      })
      .where(eq(lecturerAssessments.id, assessmentId));
    return { success: true };
  }

  async verifyGrade(gradeId: string, coordinatorId: string, sessionId: string) {
    await this.db
      .update(combinedGrades)
      .set({
        isVerifiedByKaprodi: true,
        verifiedAt: new Date(),
        verifiedByKaprodiId: coordinatorId,
        status: "APPROVED",
        updatedAt: new Date(),
      })
      .where(eq(combinedGrades.id, gradeId));
    return { success: true };
  }
  async getPendingVerifications(profileId: string, sessionId: string, prodiName: string | null) {
    const pendingList = await this.db
      .select()
      .from(combinedGrades)
      .where(
        and(
          eq(combinedGrades.isVerifiedByKaprodi, false),
          eq(combinedGrades.status, "PENDING")
        )
      );

    const results = [];
    for (const grade of pendingList) {
      const internshipRows = await this.db
        .select()
        .from(internships)
        .where(eq(internships.id, grade.internshipId))
        .limit(1);
      const internship = internshipRows[0];
      if (!internship) continue;

      const studentProfile = await this.mahasiswaService.getMahasiswaById(
        internship.mahasiswaId,
        sessionId,
      );
      if (prodiName && studentProfile) {
        const studentProdi = typeof studentProfile.prodi === "object" && studentProfile.prodi
          ? (studentProfile.prodi as any).nama
          : typeof studentProfile.prodi === "string"
          ? studentProfile.prodi
          : "";
        if (studentProdi.toLowerCase() !== prodiName.toLowerCase()) {
          continue;
        }
      }

      results.push({
        id: grade.id,
        internshipId: grade.internshipId,
        studentName: studentProfile?.profile.fullName || "-",
        studentNim: studentProfile?.nim || "-",
        prodi: (typeof studentProfile?.prodi === "object" && studentProfile?.prodi ? (studentProfile.prodi as any).nama : studentProfile?.prodi) || "-",
        companyName: internship.companyName,
        finalScore: grade.finalScore,
        letterGrade: grade.letterGrade,
        calculatedAt: grade.calculatedAt,
      });
    }
    return results;
  }

  async getPendingLecturerVerifications(profileId: string, sessionId: string, prodiName: string | null) {
    const pendingList = await this.db
      .select()
      .from(lecturerAssessments)
      .where(
        and(
          eq(lecturerAssessments.isVerifiedByKaprodi, false),
          eq(lecturerAssessments.status, "PENDING")
        )
      );

    const results = [];
    for (const assessment of pendingList) {
      const internshipRows = await this.db
        .select()
        .from(internships)
        .where(eq(internships.id, assessment.internshipId))
        .limit(1);
      const internship = internshipRows[0];
      if (!internship) continue;

      const studentProfile = await this.mahasiswaService.getMahasiswaById(
        internship.mahasiswaId,
        sessionId,
      );
      if (prodiName && studentProfile) {
        const studentProdi = typeof studentProfile.prodi === "object" && studentProfile.prodi
          ? (studentProfile.prodi as any).nama
          : typeof studentProfile.prodi === "string"
          ? studentProfile.prodi
          : "";
        if (studentProdi.toLowerCase() !== prodiName.toLowerCase()) {
          continue;
        }
      }

      results.push({
        id: assessment.id,
        internshipId: assessment.internshipId,
        studentName: studentProfile?.profile.fullName || "-",
        studentNim: studentProfile?.nim || "-",
        prodi: (typeof studentProfile?.prodi === "object" && studentProfile?.prodi ? (studentProfile.prodi as any).nama : studentProfile?.prodi) || "-",
        companyName: internship.companyName,
        totalScore: assessment.totalScore,
        assessedAt: assessment.assessedAt,
      });
    }
    return results;
  }

  async getPendingAdminVerifications(sessionId: string) {
    const pendingList = await this.db
      .select()
      .from(combinedGrades)
      .where(
        and(
          eq(combinedGrades.isVerifiedByKaprodi, true),
          eq(combinedGrades.status, "PENDING")
        )
      );

    const results = [];
    for (const grade of pendingList) {
      const internshipRows = await this.db
        .select()
        .from(internships)
        .where(eq(internships.id, grade.internshipId))
        .limit(1);
      const internship = internshipRows[0];
      if (!internship) continue;

      const studentProfile = await this.mahasiswaService.getMahasiswaById(
        internship.mahasiswaId,
        sessionId,
      );

      results.push({
        id: grade.id,
        internshipId: grade.internshipId,
        studentName: studentProfile?.profile.fullName || "-",
        studentNim: studentProfile?.nim || "-",
        prodi: (typeof studentProfile?.prodi === "object" && studentProfile?.prodi ? (studentProfile.prodi as any).nama : studentProfile?.prodi) || "-",
        companyName: internship.companyName,
        finalScore: grade.finalScore,
        letterGrade: grade.letterGrade,
        calculatedAt: grade.calculatedAt,
      });
    }
    return results;
  }

  async verifyGradeByAdmin(gradeId: string) {
    await this.db
      .update(combinedGrades)
      .set({
        status: "APPROVED",
        updatedAt: new Date(),
      })
      .where(eq(combinedGrades.id, gradeId));
    return { success: true };
  }

  private async resolveSignatureBuffer(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (e) {
      return null;
    }
  }
}
