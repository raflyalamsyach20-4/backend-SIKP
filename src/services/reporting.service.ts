import { DosenService } from "./dosen.service";
import { StorageService } from "./storage.service";
import { AssessmentService } from "./assessment.service";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TextRun,
  AlignmentType,
  BorderStyle,
  Header,
  Footer,
} from "docx";
import { createDbClient } from "../db";
import { generateId } from "../utils/helpers";
import { eq, sql, desc } from "drizzle-orm";
import {
  reports,
  titleSubmissions,
  internships,
  authSessions,
  lecturerAssessments,
} from "../db/schema";
import { AuthSessionRepository } from "../repositories/auth-session.repository";
import type { JWTPayload } from "../types";

export class ReportingService {
  private db: ReturnType<typeof createDbClient>;
  private storageService: StorageService;
  private assessmentService: AssessmentService;
  private dosenService: DosenService;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.storageService = new StorageService(this.env);
    this.assessmentService = new AssessmentService(this.env);
    this.dosenService = new DosenService(this.env);
  }

  /**
   * Submit Title and Report in one step (Simplified Flow / Fast Track)
   */
  async submitTitleAndReport(
    internshipId: string,
    data: { title: string; abstract: string; file: File },
  ) {
    const now = new Date();

    // 1. Upload Report File
    const uniqueFileName = this.storageService.generateUniqueFileName(
      data.file.name,
    );
    const upload = await this.storageService.uploadFile(
      data.file,
      uniqueFileName,
      "reports",
    );

    // 2. Insert Title Submission
    const titleId = generateId();
    await this.db.insert(titleSubmissions).values({
      id: titleId,
      internshipId,
      proposedTitle: data.title,
      description: data.abstract,
      status: "PENDING",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 3. Insert Report
    const reportId = generateId();
    const result = await this.db
      .insert(reports)
      .values({
        id: reportId,
        internshipId,
        title: data.title,
        abstract: data.abstract,
        fileName: upload.key,
        fileUrl: this.storageService.getAssetProxyUrl(upload.url)!,
        fileType: data.file.type,
        fileSize: data.file.size,
        originalName: data.file.name,
        status: "SUBMITTED",
        submittedAt: now,
        approvalStatus: "PENDING",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return result[0];
  }

  /**
   * Step-by-Step Flow: Submit Title Only
   */
  async submitTitle(
    internshipId: string,
    data: { title: string; description?: string },
  ) {
    const now = new Date();

    const existing = await this.db
      .select()
      .from(titleSubmissions)
      .where(eq(titleSubmissions.internshipId, internshipId))
      .limit(1);

    if (existing.length > 0) {
      if (existing[0].status === "REJECTED") {
        const result = await this.db
          .update(titleSubmissions)
          .set({
            proposedTitle: data.title,
            description: data.description || null,
            status: "PENDING",
            submittedAt: now,
            updatedAt: now,
            rejectionReason: null,
          })
          .where(eq(titleSubmissions.id, existing[0].id))
          .returning();
        return result[0];
      }
      throw new Error(
        "Title submission already exists and is not in a rejected state",
      );
    }

    const id = generateId();
    const result = await this.db
      .insert(titleSubmissions)
      .values({
        id,
        internshipId,
        proposedTitle: data.title,
        description: data.description || null,
        status: "PENDING",
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return result[0];
  }

  async getTitleSubmission(internshipId: string) {
    const result = await this.db
      .select()
      .from(titleSubmissions)
      .where(eq(titleSubmissions.internshipId, internshipId))
      .limit(1);

    return result[0] || null;
  }

  async approveTitle(titleId: string, dosenId: string) {
    // 1. Approve the title submission
    const result = await this.db
      .update(titleSubmissions)
      .set({
        status: "APPROVED",
        approvedBy: dosenId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(titleSubmissions.id, titleId))
      .returning();

    // 2. Also update the internship's dosenPembimbingId so the student dashboard
    //    can resolve and display the lecturer's name correctly
    if (result.length > 0) {
      const internshipId = result[0].internshipId;
      await this.db
        .update(internships)
        .set({ dosenPembimbingId: dosenId, updatedAt: new Date() })
        .where(eq(internships.id, internshipId));
    }

    return result;
  }

  async rejectTitle(titleId: string, dosenId: string, reason: string) {
    return await this.db
      .update(titleSubmissions)
      .set({
        status: "REJECTED",
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(titleSubmissions.id, titleId))
      .returning();
  }

  async submitReport(
    internshipId: string,
    data: { file: File; title?: string; abstract?: string },
  ) {
    const now = new Date();

    const title = await this.getTitleSubmission(internshipId);
    if (!title || title.status !== "APPROVED") {
      throw new Error(
        "Judul harus disetujui terlebih dahulu sebelum mengunggah laporan.",
      );
    }

    const uniqueFileName = this.storageService.generateUniqueFileName(
      data.file.name,
    );
    const upload = await this.storageService.uploadFile(
      data.file,
      uniqueFileName,
      "reports",
    );

    const existing = await this.db
      .select()
      .from(reports)
      .where(eq(reports.internshipId, internshipId))
      .limit(1);

    if (existing.length > 0) {
      const result = await this.db
        .update(reports)
        .set({
          title: data.title || title.proposedTitle,
          abstract: data.abstract || title.description,
          fileName: upload.key,
          fileUrl: this.storageService.getAssetProxyUrl(upload.url)!,
          fileType: data.file.type,
          fileSize: data.file.size,
          originalName: data.file.name,
          status: "SUBMITTED",
          submittedAt: now,
          approvalStatus: "PENDING",
          updatedAt: now,
        })
        .where(eq(reports.id, existing[0].id))
        .returning();

      return result[0];
    }

    const id = generateId();
    const result = await this.db
      .insert(reports)
      .values({
        id,
        internshipId,
        title: data.title || title.proposedTitle,
        abstract: data.abstract || title.description,
        fileName: upload.key,
        fileUrl: this.storageService.getAssetProxyUrl(upload.url)!,
        fileType: data.file.type,
        fileSize: data.file.size,
        originalName: data.file.name,
        status: "SUBMITTED",
        submittedAt: now,
        approvalStatus: "PENDING",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return result[0];
  }

  async getReport(internshipId: string) {
    const result = await this.db
      .select()
      .from(reports)
      .where(eq(reports.internshipId, internshipId))
      .limit(1);

    if (!result[0]) return null;

    return {
      ...result[0],
      fileUrl: this.storageService.getAssetProxyUrl(result[0].fileUrl),
    };
  }

  /**
   * Backfill dosenPembimbingId for existing internships where it is still null
   * but a title has already been approved (approvedBy contains the dosen's ID).
   * Call this once via an admin endpoint or on startup.
   */
  async backfillDosenPembimbingId(): Promise<{
    updated: number;
    skipped: number;
  }> {
    const approvedTitles = await this.db
      .select()
      .from(titleSubmissions)
      .where(eq(titleSubmissions.status, "APPROVED"));

    let updated = 0;
    let skipped = 0;

    const authSessionRepo = new AuthSessionRepository(this.db);

    for (const ts of approvedTitles) {
      if (!ts.approvedBy) {
        skipped++;
        continue;
      }

      let resolvedDosenId = ts.approvedBy;

      // If it looks like a CUID (not a UUID), try to find the real dosen identity ID from snapshots
      if (!ts.approvedBy.includes("-")) {
        const snapshot = await authSessionRepo.findProfileSnapshotByMahasiswaId(
          ts.approvedBy,
        );
        if (snapshot) {
          const dsnIdentity = Array.isArray(snapshot.identities)
            ? snapshot.identities.find(
                (i: any) => i.role === "DOSEN" || i.identityType === "DOSEN",
              )
            : snapshot.identities?.dosen;

          if (dsnIdentity?.id) {
            console.log(
              `[ReportingService.backfill] Resolving CUID ${ts.approvedBy} to Identity ID ${dsnIdentity.id}`,
            );
            resolvedDosenId = dsnIdentity.id;
          }
        }
      }

      const result = await this.db
        .update(internships)
        .set({ dosenPembimbingId: resolvedDosenId, updatedAt: new Date() })
        .where(eq(internships.id, ts.internshipId)) // Force update even if not null, to fix the ID format
        .returning();

      if (result.length > 0) updated++;
      else skipped++;
    }

    console.log(
      `[ReportingService.backfillDosenPembimbingId] updated=${updated}, skipped=${skipped}`,
    );
    return { updated, skipped };
  }

  /**
   * Repair Kaprodi and Prodi data:
   * 1. Search for users with KAPRODI role in auth_sessions.
   * 2. Re-sync their profile from SSO to fix names/NIPs.
   * 3. Sync program_studies and faculties tables.
   */
  async repairKaprodiData(): Promise<{
    updated: number;
    synced: number;
    skipped: number;
  }> {
    // 1. Find all potential Kaprodi sessions (contains KAPRODI in JSON snapshot)
    const kaprodiSessions = await this.db
      .select()
      .from(authSessions)
      .where(sql`${authSessions.profileSnapshot}::text ILIKE '%KAPRODI%'`);

    let updated = 0;
    let synced = 0;
    let skipped = 0;

    for (const session of kaprodiSessions) {
      try {
        // Use any active session ID to fetch from SSO, or empty if none (service token fallback)
        const ssoProfile = await this.dosenService.getDosenById(
          session.authUserId,
          "",
        );

        if (ssoProfile) {
          // A. Update local session snapshot if it was mock/wrong
          await this.db
            .update(authSessions)
            .set({
              profileSnapshot: {
                ...ssoProfile,
                // Keep the authUserId in the snapshot
                authUserId: session.authUserId,
              } as any,
              updatedAt: new Date(),
            })
            .where(eq(authSessions.sessionId, session.sessionId));

          updated++;

          synced++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(
          `[ReportingService.repairKaprodiData] Error for ${session.authUserId}:`,
          err,
        );
        skipped++;
      }
    }

    return { updated, synced, skipped };
  }

  async scoreReport(
    internshipId: string,
    dosenId: string,
    scores: {
      formatKesesuaian: number;
      penguasaanMateri: number;
      analisisPerancangan: number;
      sikapEtika: number;
      components?: any[];
      feedback?: string;
    },
  ) {
    const now = new Date();

    let academicScore = 0;
    if (scores.components && scores.components.length > 0) {
      let total = 0;
      for (const comp of scores.components) {
        const score = Number(comp.score) || 0;
        const weight = Number(comp.weight) || 0;
        total += score * (weight / 100);
      }
      academicScore = Math.round(total);
    } else {
      academicScore = Math.round(
        (Number(scores.formatKesesuaian) || 0) * 0.3 +
          (Number(scores.penguasaanMateri) || 0) * 0.3 +
          (Number(scores.analisisPerancangan) || 0) * 0.3 +
          (Number(scores.sikapEtika) || 0) * 0.1,
      );
    }

    const existing = await this.db
      .select()
      .from(lecturerAssessments)
      .where(eq(lecturerAssessments.internshipId, internshipId))
      .limit(1);

    let lecturerAssessmentId: string;

    if (existing.length > 0) {
      lecturerAssessmentId = existing[0].id;
      await this.db
        .update(lecturerAssessments)
        .set({
          dosenId,
          formatKesesuaian: Number(scores.formatKesesuaian) || 0,
          penguasaanMateri: Number(scores.penguasaanMateri) || 0,
          analisisPerancangan: Number(scores.analisisPerancangan) || 0,
          sikapEtika: Number(scores.sikapEtika) || 0,
          totalScore: academicScore,
          components: scores.components || [],
          feedback: scores.feedback || "",
          assessedAt: now,
          updatedAt: now,
        })
        .where(eq(lecturerAssessments.id, lecturerAssessmentId));
    } else {
      lecturerAssessmentId = generateId();
      await this.db.insert(lecturerAssessments).values({
        id: lecturerAssessmentId,
        internshipId,
        dosenId,
        formatKesesuaian: Number(scores.formatKesesuaian) || 0,
        penguasaanMateri: Number(scores.penguasaanMateri) || 0,
        analisisPerancangan: Number(scores.analisisPerancangan) || 0,
        sikapEtika: Number(scores.sikapEtika) || 0,
        totalScore: academicScore,
        components: scores.components || [],
        feedback: scores.feedback || "",
        assessedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    await this.db
      .update(reports)
      .set({
        status: "APPROVED",
        approvalStatus: "APPROVED",
        reviewedBy: dosenId,
        reviewedAt: now,
      })
      .where(eq(reports.internshipId, internshipId));

    await this.db
      .update(titleSubmissions)
      .set({ status: "APPROVED", approvedBy: dosenId, approvedAt: now })
      .where(eq(titleSubmissions.internshipId, internshipId));

    return await this.assessmentService.calculateCombinedGrade(
      internshipId,
      lecturerAssessmentId,
      academicScore,
    );
  }

  /**
   * For Lecturer Dashboard: List all reports from students assigned to this lecturer
   */
  async getMenteesReports(dosenId: string) {
    const results = await this.db
      .select({
        report: reports,
        internship: internships,
      })
      .from(reports)
      .innerJoin(internships, eq(reports.internshipId, internships.id))
      .where(eq(internships.dosenPembimbingId, dosenId))
      .orderBy(desc(reports.submittedAt));

    const authSessionRepo = new AuthSessionRepository(this.db);
    const enrichedResults = [];

    for (const r of results) {
      let studentName = r.internship.mahasiswaId;
      let studentNim = r.internship.mahasiswaId;

      const snapshot = await authSessionRepo.findProfileSnapshotByMahasiswaId(
        r.internship.mahasiswaId,
      );
      if (snapshot) {
        studentName =
          snapshot.nama ||
          snapshot.fullName ||
          snapshot.name ||
          r.internship.mahasiswaId;
        // In SsoProfileData, identity details are often in an array or object
        const mhsIdentity = Array.isArray(snapshot.identities)
          ? snapshot.identities.find(
              (i: any) =>
                i.role === "MAHASISWA" || i.identityType === "MAHASISWA",
            )
          : snapshot.identities?.mahasiswa;

        if (mhsIdentity?.nim) {
          studentNim = mhsIdentity.nim;
        }
      }

      enrichedResults.push({
        ...r.report,
        fileUrl: this.storageService.getAssetProxyUrl(r.report.fileUrl),
        companyName: r.internship.companyName,
        mahasiswaId: r.internship.mahasiswaId,
        studentName,
        studentNim,
      });
    }

    return enrichedResults;
  }

  async approveReport(reportId: string, dosenId: string) {
    const now = new Date();
    return await this.db
      .update(reports)
      .set({
        status: "APPROVED",
        approvalStatus: "APPROVED",
        reviewedBy: dosenId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(reports.id, reportId))
      .returning();
  }

  async rejectReport(reportId: string, dosenId: string, notes: string) {
    const now = new Date();
    return await this.db
      .update(reports)
      .set({
        status: "REJECTED",
        approvalStatus: "REJECTED",
        reviewedBy: dosenId,
        reviewedAt: now,
        revisionNotes: notes,
        updatedAt: now,
      })
      .where(eq(reports.id, reportId))
      .returning();
  }

  /**
   * Hybrid Security Implementation for Dosen Assessment
   */
  async generateDosenAssessmentDocument(
    internshipId: string,
    format: "pdf" | "docx",
    user: JWTPayload,
  ) {
    // 1. Get complete data
    const data = await this.getAssessmentFullData(internshipId);
    if (!data) throw new Error("Internship data not found");

    // 2. Ownership Validation
    const isOwner =
      data.internship.mahasiswaId === user.mahasiswaId ||
      data.internship.mahasiswaId === user.userId;
    const isLecturer =
      data.internship.dosenPembimbingId === user.dosenId ||
      data.internship.dosenPembimbingId === user.userId;
    const isStaff =
      user.role === "admin" ||
      user.role === "kaprodi" ||
      user.role === "superadmin";

    if (!isOwner && !isLecturer && !isStaff) {
      throw new Error(
        "Unauthorized: You do not have permission to access this document",
      );
    }

    if (format === "pdf") {
      return await this.generateDosenAssessmentPDF(data);
    } else {
      return await this.generateDosenAssessmentDOCX(data);
    }
  }

  private async getAssessmentFullData(internshipId: string) {
    const internshipData = await this.db.query.internships.findFirst({
      where: eq(internships.id, internshipId),
      with: {
        submission: true,
        lecturerAssessment: true,
      },
    });

    if (!internshipData) return null;

    const authRepo = new AuthSessionRepository(this.db);

    // Get Student Profile
    const studentProfile = await authRepo.findProfileSnapshotByMahasiswaId(
      internshipData.mahasiswaId,
    );

    // Get Lecturer Profile
    const lecturerProfile = internshipData.dosenPembimbingId
      ? await authRepo.findProfileSnapshotByMahasiswaId(
          internshipData.dosenPembimbingId,
        )
      : null;

    // Get Kaprodi Profile (Role Based)
    const kaprodiSession = await this.db
      .select()
      .from(authSessions)
      .where(sql`${authSessions.profileSnapshot}::text ILIKE '%KAPRODI%'`)
      .limit(1);

    const kaprodiProfile = kaprodiSession[0]?.profileSnapshot as any;

    return {
      internship: internshipData,
      student: studentProfile,
      lecturer: lecturerProfile,
      lecturerSignature: null, // Fetched from proxy in Pattern 1
      kaprodi: kaprodiProfile,
      kaprodiSignature: null, // Fetched from proxy in Pattern 1
      assessment: internshipData.lecturerAssessment,
    };
  }

  private async generateDosenAssessmentPDF(data: any) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header & Content (Simplified for now, using pdf-lib primitives)
    page.drawText("FORMULIR PENILAIAN DOSEN PEMBIMBING", {
      x: 150,
      y: 800,
      size: 14,
      font: fontBold,
    });

    let y = 760;
    const drawLabelValue = (label: string, value: string) => {
      page.drawText(`${label}:`, { x: 50, y, size: 10, font: fontBold });
      page.drawText(value || "-", { x: 180, y, size: 10, font });
      y -= 20;
    };

    drawLabelValue(
      "Nama Mahasiswa",
      data.student?.nama || data.student?.fullName,
    );
    drawLabelValue(
      "NIM",
      data.student?.identities?.find((i: any) => i.role === "MAHASISWA")?.nim ||
        "-",
    );
    drawLabelValue("Perusahaan", data.internship.companyName);

    y -= 20;
    page.drawText("Komponen Penilaian:", {
      x: 50,
      y,
      size: 11,
      font: fontBold,
    });
    y -= 25;

    // Table Header
    page.drawRectangle({
      x: 50,
      y: y - 5,
      width: 500,
      height: 20,
      color: rgb(0.9, 0.9, 0.9),
    });
    page.drawText("Kriteria", { x: 55, y, size: 10, font: fontBold });
    page.drawText("Bobot", { x: 350, y, size: 10, font: fontBold });
    page.drawText("Nilai", { x: 450, y, size: 10, font: fontBold });
    y -= 25;

    const components = data.assessment?.components || [
      {
        label: "Format & Kesesuaian",
        weight: 30,
        score: data.assessment?.formatKesesuaian,
      },
      {
        label: "Penguasaan Materi",
        weight: 30,
        score: data.assessment?.penguasaanMateri,
      },
      {
        label: "Analisis & Perancangan",
        weight: 30,
        score: data.assessment?.analisisPerancangan,
      },
      {
        label: "Sikap & Etika",
        weight: 10,
        score: data.assessment?.sikapEtika,
      },
    ];

    components.forEach((c: any) => {
      page.drawText(c.label || c.category, { x: 55, y, size: 10, font });
      page.drawText(`${c.weight}%`, { x: 350, y, size: 10, font });
      page.drawText(String(c.score || 0), { x: 450, y, size: 10, font });
      y -= 20;
    });

    y -= 10;
    page.drawRectangle({
      x: 50,
      y: y - 5,
      width: 500,
      height: 20,
      color: rgb(0.95, 0.95, 0.95),
    });
    page.drawText("Total Nilai Akhir (Weighted)", {
      x: 55,
      y,
      size: 10,
      font: fontBold,
    });
    page.drawText(String(data.assessment?.totalScore || 0), {
      x: 450,
      y,
      size: 11,
      font: fontBold,
    });

    // Signatures
    y -= 100;
    const signX = 50;

    page.drawText("Dosen Pembimbing,", { x: signX, y: y + 60, size: 10, font });
    if (data.lecturerSignature) {
      try {
        const signImageBytes = await fetch(data.lecturerSignature).then((res) =>
          res.arrayBuffer(),
        );
        const signImage = await pdfDoc.embedPng(signImageBytes);
        page.drawImage(signImage, { x: signX, y: y, width: 80, height: 50 });
      } catch (e) {
        page.drawText("(Tanda Tangan Digital)", {
          x: signX,
          y: y + 20,
          size: 8,
          font,
        });
      }
    }
    page.drawText(data.lecturer?.nama || "-", {
      x: signX,
      y: y - 15,
      size: 10,
      font: fontBold,
    });

    const signX2 = 350;
    page.drawText("Ketua Program Studi,", {
      x: signX2,
      y: y + 60,
      size: 10,
      font,
    });
    if (data.kaprodiSignature) {
      try {
        const signImageBytes = await fetch(data.kaprodiSignature).then((res) =>
          res.arrayBuffer(),
        );
        const signImage = await pdfDoc.embedPng(signImageBytes);
        page.drawImage(signImage, { x: signX2, y: y, width: 80, height: 50 });
      } catch (e) {
        page.drawText("(Tanda Tangan Digital)", {
          x: signX2,
          y: y + 20,
          size: 8,
          font,
        });
      }
    }
    page.drawText(data.kaprodi?.nama || "-", {
      x: signX2,
      y: y - 15,
      size: 10,
      font: fontBold,
    });

    return await pdfDoc.save();
  }

  private async generateDosenAssessmentDOCX(data: any) {
    // Hybrid Security: No Scores, No Signatures for DOCX
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              text: "FORMULIR PENILAIAN DOSEN PEMBIMBING (DRAFT)",
              heading: "Heading1",
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: "" }),
            new Paragraph({
              children: [
                new TextRun({ text: `Nama Mahasiswa: `, bold: true }),
                new TextRun({
                  text: data.student?.nama || data.student?.fullName,
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: `NIM: `, bold: true }),
                new TextRun({
                  text:
                    data.student?.identities?.find(
                      (i: any) => i.role === "MAHASISWA",
                    )?.nim || "-",
                }),
              ],
            }),
            new Paragraph({ text: "" }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text: "Kriteria", bold: true }),
                          ],
                        }),
                      ],
                    }),
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text: "Bobot", bold: true }),
                          ],
                        }),
                      ],
                    }),
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "Nilai (Isi Manual)",
                              bold: true,
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
                ...[
                  { label: "Format & Kesesuaian", weight: 30 },
                  { label: "Penguasaan Materi", weight: 30 },
                  { label: "Analisis & Perancangan", weight: 30 },
                  { label: "Sikap & Etika", weight: 10 },
                ].map(
                  (c) =>
                    new TableRow({
                      children: [
                        new TableCell({ children: [new Paragraph(c.label)] }),
                        new TableCell({
                          children: [new Paragraph(`${c.weight}%`)],
                        }),
                        new TableCell({ children: [new Paragraph("")] }), // BLANK FOR SECURITY
                      ],
                    }),
                ),
              ],
            }),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "" }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
              },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph("Dosen Pembimbing,")],
                      borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE },
                        right: { style: BorderStyle.NONE },
                      },
                    }),
                    new TableCell({
                      children: [new Paragraph("Ketua Program Studi,")],
                      borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE },
                        right: { style: BorderStyle.NONE },
                      },
                    }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph("\n\n\n")],
                      borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE },
                        right: { style: BorderStyle.NONE },
                      },
                    }),
                    new TableCell({
                      children: [new Paragraph("\n\n\n")],
                      borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE },
                        right: { style: BorderStyle.NONE },
                      },
                    }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text:
                                data.lecturer?.nama ||
                                "(...........................)",
                              bold: true,
                            }),
                          ],
                        }),
                      ],
                      borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE },
                        right: { style: BorderStyle.NONE },
                      },
                    }),
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text:
                                data.kaprodi?.nama ||
                                "(...........................)",
                              bold: true,
                            }),
                          ],
                        }),
                      ],
                      borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.NONE },
                        right: { style: BorderStyle.NONE },
                      },
                    }),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    });

    return await Packer.toBuffer(doc);
  }
}
