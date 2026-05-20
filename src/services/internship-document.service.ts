import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} from "docx";
import { createDbClient } from "@/db";
import { LogbookRepository } from "@/repositories/logbook.repository";
import { MahasiswaRepository } from "@/repositories/mahasiswa.repository";
import { MentorRepository } from "@/repositories/mentor.repository";
import { StorageService } from "./storage.service";
import { MahasiswaService } from "./mahasiswa.service";
import { DosenService } from "./dosen.service";
import {
  assessments,
  lecturerAssessments,
  combinedGrades,
  internships,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface GenerationOptions {
  format: "pdf" | "docx";
  withSignature: boolean;
}

export class InternshipDocumentService {
  private logbookRepo: LogbookRepository;
  private mahasiswaRepo: MahasiswaRepository;
  private mentorRepo: MentorRepository;
  private storageService: StorageService;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;
  private db: ReturnType<typeof createDbClient>;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.logbookRepo = new LogbookRepository(this.db);
    this.mahasiswaRepo = new MahasiswaRepository(this.db);
    this.mentorRepo = new MentorRepository(this.db);
    this.storageService = new StorageService(this.env);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.dosenService = new DosenService(this.env);
  }

  /**
   * Check if logbook is considered "full"
   * Based on the number of entries compared to the number of workdays (Mon-Fri)
   * between the internship's start and end dates.
   */
  async isLogbookFull(internshipId: string): Promise<boolean> {
    const result = await this.db
      .select({
        startDate: internships.startDate,
        endDate: internships.endDate,
      })
      .from(internships)
      .where(eq(internships.id, internshipId))
      .limit(1);

    if (result.length === 0) return false;

    const { startDate, endDate } = result[0];
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Calculate expected workdays (simple approximation or actual count)
    let expectedDays = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) expectedDays++; // Skip Sat (6) and Sun (0)
      current.setDate(current.getDate() + 1);
    }

    const logbooks = await this.logbookRepo.findByInternshipId(internshipId);

    // We allow a small margin (e.g. 90% of expected days) to be considered "full"
    // or strictly match the count. Let's go with 80% to be safe for holidays.
    return logbooks.length >= Math.floor(expectedDays * 0.8);
  }

  /**
   * Check if assessment has been filled by mentor
   */
  async isAssessmentFilled(internshipId: string): Promise<boolean> {
    const result = await this.db
      .select()
      .from(assessments)
      .where(eq(assessments.internshipId, internshipId))
      .limit(1);
    return result.length > 0;
  }

  /**
   * Generate Logbook Document
   */
  async generateLogbook(
    userId: string,
    sessionId: string,
    options: GenerationOptions,
  ) {
    const data = await this.mahasiswaRepo.getInternshipData(userId);
    if (!data || !data.internshipId) throw new Error("Internship not found");

    const studentProfile = await this.mahasiswaService.getMahasiswaById(
      userId,
      sessionId,
    );
    const logbookEntries = await this.logbookRepo.findByInternshipId(
      data.internshipId,
    );

    let mentorProfile = null;
    if (data.pembimbingLapanganId) {
      mentorProfile = await this.mentorRepo.findProfileById(
        data.pembimbingLapanganId,
      );
    }

    if (options.format === "pdf") {
      return await this.generateLogbookPDF(
        studentProfile,
        data,
        mentorProfile,
        logbookEntries,
        options.withSignature,
      );
    } else {
      return await this.generateLogbookDocx(
        studentProfile,
        data,
        mentorProfile,
        logbookEntries,
        options.withSignature,
      );
    }
  }

  /**
   * Generate Assessment Document
   */
  async generateAssessment(
    userId: string,
    sessionId: string,
    options: GenerationOptions,
  ) {
    const data = await this.mahasiswaRepo.getInternshipData(userId);
    if (!data || !data.internshipId) throw new Error("Internship not found");

    const studentProfile = await this.mahasiswaService.getMahasiswaById(
      userId,
      sessionId,
    );
    const assessmentResult = await this.db
      .select()
      .from(assessments)
      .where(eq(assessments.internshipId, data.internshipId))
      .limit(1);

    const assessment = assessmentResult[0] || null;

    let mentorProfile = null;
    if (data.pembimbingLapanganId) {
      mentorProfile = await this.mentorRepo.findProfileById(
        data.pembimbingLapanganId,
      );
    }

    if (options.format === "pdf") {
      return await this.generateAssessmentPDF(
        studentProfile,
        data,
        mentorProfile,
        assessment,
        options.withSignature,
      );
    } else {
      return await this.generateAssessmentDocx(
        studentProfile,
        data,
        mentorProfile,
        assessment,
        options.withSignature,
      );
    }
  }

  private async fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (e) {
      console.error("[InternshipDocumentService] Failed to fetch image:", e);
      return null;
    }
  }

  private async embedImageToPdf(pdfDoc: any, buffer: Buffer) {
    // Magic numbers for PNG: 89 50 4E 47 0D 0A 1A 0A
    // Magic numbers for JPEG: FF D8 FF
    const hex = buffer.toString("hex", 0, 4).toUpperCase();
    if (hex === "89504E47") {
      return await pdfDoc.embedPng(buffer);
    } else if (hex.startsWith("FFD8FF")) {
      return await pdfDoc.embedJpg(buffer);
    } else {
      // Default fallback to PNG if magic numbers don't match exactly but we hope it works
      try {
        return await pdfDoc.embedPng(buffer);
      } catch (e) {
        return await pdfDoc.embedJpg(buffer);
      }
    }
  }

  private async generateLogbookPDF(
    student: any,
    internship: any,
    mentor: any,
    entries: any[],
    withSignature: boolean,
  ): Promise<Buffer> {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { height } = page.getSize();
    let currentY = height - 50;

    // Header
    page.drawText("LOGBOOK KEGIATAN KERJA PRAKTIK", {
      x: 150,
      y: currentY,
      size: 14,
      font: fontBold,
    });
    currentY -= 40;

    // Student Info
    page.drawText(`Nama Mahasiswa: ${student.profile.fullName}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: fontNormal,
    });
    currentY -= 15;
    page.drawText(`NIM: ${student.nim}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: fontNormal,
    });
    currentY -= 15;
    page.drawText(`Program Studi: ${student.prodi?.nama || "-"}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: fontNormal,
    });
    currentY -= 15;
    page.drawText(`Instansi: ${internship.company || "-"}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: fontNormal,
    });
    currentY -= 40;

    // Table Header
    const itemCodeX = 50;
    const descriptionX = 150;
    const hoursX = 450;

    page.drawText("Tanggal", {
      x: itemCodeX,
      y: currentY,
      size: 10,
      font: fontBold,
    });
    page.drawText("Aktivitas", {
      x: descriptionX,
      y: currentY,
      size: 10,
      font: fontBold,
    });
    page.drawText("Jam", { x: hoursX, y: currentY, size: 10, font: fontBold });
    currentY -= 10;
    page.drawLine({
      start: { x: 50, y: currentY },
      end: { x: 545, y: currentY },
      thickness: 1,
    });
    currentY -= 15;

    // Table Rows
    for (const entry of entries) {
      if (currentY < 100) {
        page = pdfDoc.addPage([595.28, 841.89]);
        currentY = height - 50;

        // Repeat Table Header
        page.drawText("Tanggal", {
          x: itemCodeX,
          y: currentY,
          size: 10,
          font: fontBold,
        });
        page.drawText("Aktivitas", {
          x: descriptionX,
          y: currentY,
          size: 10,
          font: fontBold,
        });
        page.drawText("Jam", {
          x: hoursX,
          y: currentY,
          size: 10,
          font: fontBold,
        });
        currentY -= 10;
        page.drawLine({
          start: { x: 50, y: currentY },
          end: { x: 545, y: currentY },
          thickness: 1,
        });
        currentY -= 15;
      }

      page.drawText(new Date(entry.date).toLocaleDateString("id-ID"), {
        x: itemCodeX,
        y: currentY,
        size: 9,
        font: fontNormal,
      });

      // Basic text wrapping for activity (simplified)
      const activityText = entry.activity || "";
      let textLine = "";
      const words = activityText.split(" ");
      let lineY = currentY;

      for (const word of words) {
        const testLine = textLine + word + " ";
        const textWidth = fontNormal.widthOfTextAtSize(testLine, 9);
        if (textWidth > 280) {
          page.drawText(textLine, {
            x: descriptionX,
            y: lineY,
            size: 9,
            font: fontNormal,
          });
          textLine = word + " ";
          lineY -= 12;
        } else {
          textLine = testLine;
        }
      }
      page.drawText(textLine, {
        x: descriptionX,
        y: lineY,
        size: 9,
        font: fontNormal,
      });

      page.drawText(entry.hours?.toString() || "0", {
        x: hoursX,
        y: currentY,
        size: 9,
        font: fontNormal,
      });

      currentY = lineY - 20; // Move to next row based on activity text height
    }

    // Signatures
    if (currentY < 150) {
      page = pdfDoc.addPage([595.28, 841.89]);
      currentY = height - 50;
    }

    currentY -= 30;
    const signatureY = currentY;
    page.drawText("Mahasiswa,", {
      x: 100,
      y: signatureY,
      size: 10,
      font: fontNormal,
    });
    page.drawText("Pembimbing Lapangan,", {
      x: 400,
      y: signatureY,
      size: 10,
      font: fontNormal,
    });

    currentY -= 70;
    page.drawText(student.profile.fullName, {
      x: 100,
      y: currentY,
      size: 10,
      font: fontNormal,
    });
    page.drawText(mentor?.fullName || "(....................)", {
      x: 400,
      y: currentY,
      size: 10,
      font: fontNormal,
    });

    if (withSignature && mentor?.signatureUrl) {
      const sigBuffer = await this.fetchImageBuffer(mentor.signatureUrl);
      if (sigBuffer) {
        try {
          const sigImage = await this.embedImageToPdf(pdfDoc, sigBuffer);
          const sigDims = sigImage.scaleToFit(120, 50);
          page.drawImage(sigImage, {
            x: 400,
            y: currentY + 10,
            width: sigDims.width,
            height: sigDims.height,
          });
        } catch (e) {
          console.error(
            "[InternshipDocumentService] Failed to embed signature to Logbook PDF:",
            e,
          );
          page.drawText("[Gagal Memuat Tanda Tangan Digital]", {
            x: 400,
            y: currentY + 20,
            size: 8,
            font: fontNormal,
            color: rgb(1, 0, 0),
          });
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private async generateLogbookDocx(
    student: any,
    internship: any,
    mentor: any,
    entries: any[],
    withSignature: boolean,
  ): Promise<Buffer> {
    const tableRows = [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Tanggal", bold: true })],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Aktivitas", bold: true })],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Durasi (Jam)", bold: true })],
              }),
            ],
          }),
        ],
      }),
      ...entries.map(
        (entry) =>
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph(
                    new Date(entry.date).toLocaleDateString("id-ID"),
                  ),
                ],
              }),
              new TableCell({ children: [new Paragraph(entry.activity)] }),
              new TableCell({
                children: [new Paragraph(entry.hours?.toString() || "0")],
              }),
            ],
          }),
      ),
    ];

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: "LOGBOOK KEGIATAN KERJA PRAKTIK",
              heading: "Title",
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: "" }),
            new Paragraph({
              children: [
                new TextRun({ text: "Nama: ", bold: true }),
                new TextRun(student.profile.fullName),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "NIM: ", bold: true }),
                new TextRun(student.nim),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Instansi: ", bold: true }),
                new TextRun(internship.company || "-"),
              ],
            }),
            new Paragraph({ text: "" }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: tableRows,
            }),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "" }),
            new Paragraph({
              children: [
                new TextRun({ text: "Mahasiswa,", break: 1 }),
                new TextRun({ text: "\t\t\t\t\t\t\t\t\t\t\t" }),
                new TextRun({ text: "Pembimbing Lapangan," }),
              ],
            }),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "" }),
            new Paragraph({
              children: [
                new TextRun({ text: student.profile.fullName }),
                new TextRun({ text: "\t\t\t\t\t\t\t\t\t\t\t" }),
                new TextRun({
                  text: mentor?.fullName || "(....................)",
                }),
              ],
            }),
          ],
        },
      ],
    });

    return await Packer.toBuffer(doc);
  }

  private async generateAssessmentPDF(
    student: any,
    internship: any,
    mentor: any,
    assessment: any,
    withSignature: boolean,
  ): Promise<Buffer> {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([595.28, 841.89]);
    const { height } = page.getSize();
    let currentY = height - 50;

    page.drawText("FORM PENILAIAN KERJA PRAKTIK", {
      x: 170,
      y: currentY,
      size: 14,
      font: fontBold,
    });
    currentY -= 40;

    page.drawText(`Nama Mahasiswa: ${student.profile.fullName}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: fontNormal,
    });
    currentY -= 15;
    page.drawText(`NIM: ${student.nim}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: fontNormal,
    });
    currentY -= 15;
    page.drawText(`Instansi: ${internship.company || "-"}`, {
      x: 50,
      y: currentY,
      size: 10,
      font: fontNormal,
    });
    currentY -= 40;

    if (!assessment) {
      page.drawText("NILAI BELUM DIISI OLEH PEMBIMBING LAPANGAN", {
        x: 120,
        y: currentY,
        size: 12,
        font: fontBold,
        color: rgb(1, 0, 0),
      });
      currentY -= 40;
    } else {
      page.drawText("KRITERIA PENILAIAN:", {
        x: 50,
        y: currentY,
        size: 10,
        font: fontBold,
      });
      currentY -= 20;
      page.drawText(`1. Kehadiran (20%): ${assessment.kehadiran}`, {
        x: 70,
        y: currentY,
        size: 10,
        font: fontNormal,
      });
      currentY -= 15;
      page.drawText(`2. Kerjasama (30%): ${assessment.kerjasama}`, {
        x: 70,
        y: currentY,
        size: 10,
        font: fontNormal,
      });
      currentY -= 15;
      page.drawText(`3. Sikap & Etika (20%): ${assessment.sikapEtika}`, {
        x: 70,
        y: currentY,
        size: 10,
        font: fontNormal,
      });
      currentY -= 15;
      page.drawText(`4. Prestasi Kerja (20%): ${assessment.prestasiKerja}`, {
        x: 70,
        y: currentY,
        size: 10,
        font: fontNormal,
      });
      currentY -= 15;
      page.drawText(`5. Kreatifitas (10%): ${assessment.kreatifitas}`, {
        x: 70,
        y: currentY,
        size: 10,
        font: fontNormal,
      });
      currentY -= 30;
      page.drawText(`TOTAL SKOR: ${assessment.totalScore}`, {
        x: 50,
        y: currentY,
        size: 11,
        font: fontBold,
      });
      currentY -= 40;
    }

    const signatureY = currentY;
    page.drawText("Pembimbing Lapangan,", {
      x: 400,
      y: signatureY,
      size: 10,
      font: fontNormal,
    });

    currentY -= 70;
    page.drawText(mentor?.fullName || "(....................)", {
      x: 400,
      y: currentY,
      size: 10,
      font: fontNormal,
    });

    if (withSignature && mentor?.signatureUrl) {
      const sigBuffer = await this.fetchImageBuffer(mentor.signatureUrl);
      if (sigBuffer) {
        try {
          const sigImage = await this.embedImageToPdf(pdfDoc, sigBuffer);
          const sigDims = sigImage.scaleToFit(120, 50);
          page.drawImage(sigImage, {
            x: 400,
            y: currentY + 10,
            width: sigDims.width,
            height: sigDims.height,
          });
        } catch (e) {
          console.error(
            "[InternshipDocumentService] Failed to embed signature to Assessment PDF:",
            e,
          );
          page.drawText("[Gagal Memuat Tanda Tangan Digital]", {
            x: 400,
            y: currentY + 20,
            size: 8,
            font: fontNormal,
            color: rgb(1, 0, 0),
          });
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private async generateAssessmentDocx(
    student: any,
    internship: any,
    mentor: any,
    assessment: any,
    withSignature: boolean,
  ): Promise<Buffer> {
    const children: any[] = [
      new Paragraph({
        text: "FORM PENILAIAN KERJA PRAKTIK",
        heading: "Title",
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun({ text: "Nama: ", bold: true }),
          new TextRun(student.profile.fullName),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "NIM: ", bold: true }),
          new TextRun(student.nim),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Instansi: ", bold: true }),
          new TextRun(internship.company || "-"),
        ],
      }),
      new Paragraph({ text: "" }),
    ];

    if (!assessment) {
      children.push(
        new Paragraph({
          text: "NILAI BELUM DIISI OLEH PEMBIMBIMBING LAPANGAN",
          alignment: AlignmentType.CENTER,
        }),
      );
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "KRITERIA PENILAIAN:", bold: true })],
        }),
      );
      children.push(
        new Paragraph({ text: `1. Kehadiran (20%): ${assessment.kehadiran}` }),
      );
      children.push(
        new Paragraph({ text: `2. Kerjasama (30%): ${assessment.kerjasama}` }),
      );
      children.push(
        new Paragraph({
          text: `3. Sikap & Etika (20%): ${assessment.sikapEtika}`,
        }),
      );
      children.push(
        new Paragraph({
          text: `4. Prestasi Kerja (20%): ${assessment.prestasiKerja}`,
        }),
      );
      children.push(
        new Paragraph({
          text: `5. Kreatifitas (10%): ${assessment.kreatifitas}`,
        }),
      );
      children.push(new Paragraph({ text: "" }));
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `TOTAL SKOR: ${assessment.totalScore}`,
              bold: true,
            }),
          ],
        }),
      );
    }

    children.push(new Paragraph({ text: "" }));
    children.push(
      new Paragraph({
        text: "Pembimbing Lapangan,",
        alignment: AlignmentType.RIGHT,
      }),
    );
    children.push(new Paragraph({ text: "" }));
    children.push(new Paragraph({ text: "" }));
    children.push(
      new Paragraph({
        text: mentor?.fullName || "(....................)",
        alignment: AlignmentType.RIGHT,
      }),
    );

    const doc = new Document({
      sections: [{ children }],
    });

    return await Packer.toBuffer(doc);
  }
}
