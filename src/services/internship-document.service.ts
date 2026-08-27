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
import { AuthSessionRepository } from "@/repositories/auth-session.repository";
import { StorageService } from "./storage.service";
import { MahasiswaService } from "./mahasiswa.service";
import { DosenService } from "./dosen.service";
import { SsoSignatureProxyService } from "./sso-signature-proxy.service";
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
  private authSessionRepo: AuthSessionRepository;
  private storageService: StorageService;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;
  private ssoSignatureProxyService: SsoSignatureProxyService;
  private db: ReturnType<typeof createDbClient>;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.logbookRepo = new LogbookRepository(this.db);
    this.mahasiswaRepo = new MahasiswaRepository(this.db);
    this.mentorRepo = new MentorRepository(this.db);
    this.authSessionRepo = new AuthSessionRepository(this.db);
    this.storageService = new StorageService(this.env);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.dosenService = new DosenService(this.env);
    this.ssoSignatureProxyService = new SsoSignatureProxyService(this.env);
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
    let mentorSignature = null;
    if (data.pembimbingLapanganId) {
      mentorProfile = await this.mentorRepo.findProfileById(
        data.pembimbingLapanganId,
      );
      if (options.withSignature) {
        mentorSignature = await this.resolveMentorSignature(
          data.pembimbingLapanganId,
          data.internshipId,
        );
      }
    }

    if (options.format === "pdf") {
      return await this.generateLogbookPDF(
        studentProfile,
        data,
        mentorProfile,
        mentorSignature,
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
   * Generate Logbook Document by internship ID (used for lecturer exports)
   */
  async generateLogbookByInternshipId(
    internshipId: string,
    sessionId: string,
    options: GenerationOptions,
  ) {
    const data =
      await this.mahasiswaRepo.getInternshipDataByInternshipId(internshipId);
    if (!data || !data.internshipId || !data.studentId) {
      throw new Error("Internship not found");
    }

    const studentProfile = await this.mahasiswaService.getMahasiswaById(
      data.studentId,
      sessionId,
    );
    const logbookEntries = await this.logbookRepo.findByInternshipId(
      data.internshipId,
    );

    let mentorProfile = null;
    let mentorSignature = null;
    if (data.pembimbingLapanganId) {
      mentorProfile = await this.mentorRepo.findProfileById(
        data.pembimbingLapanganId,
      );
      if (options.withSignature) {
        mentorSignature = await this.resolveMentorSignature(
          data.pembimbingLapanganId,
          data.internshipId,
        );
      }
    }

    if (options.format === "pdf") {
      return await this.generateLogbookPDF(
        studentProfile,
        data,
        mentorProfile,
        mentorSignature,
        logbookEntries,
        options.withSignature,
      );
    }

    return await this.generateLogbookDocx(
      studentProfile,
      data,
      mentorProfile,
      logbookEntries,
      options.withSignature,
    );
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
    let mentorSignature = null;
    if (data.pembimbingLapanganId) {
      mentorProfile = await this.mentorRepo.findProfileById(
        data.pembimbingLapanganId,
      );
      if (options.withSignature) {
        mentorSignature = await this.resolveMentorSignature(
          data.pembimbingLapanganId,
          data.internshipId,
        );
      }
    }

    if (options.format === "pdf") {
      return await this.generateAssessmentPDF(
        studentProfile,
        data,
        mentorProfile,
        mentorSignature,
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

  private async drawSvgSignature(
    page: any,
    svgText: string,
    targetX: number,
    targetY: number,
    targetW: number,
    targetH: number,
  ) {
    try {
      const { rgb } = await import("pdf-lib");
      const pathRegex = /<path[^>]*\s+d=["']([^"']+)["']/g;
      const paths: string[] = [];
      let match;
      while ((match = pathRegex.exec(svgText)) !== null) {
        paths.push(match[1]);
      }

      if (paths.length === 0) return;

      // Calculate bounding box of the signature
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      paths.forEach(pathStr => {
        const nums = pathStr.match(/-?\d+\.?\d*/g)?.map(Number) || [];
        for (let i = 0; i < nums.length; i += 2) {
          const x = nums[i];
          const y = nums[i+1];
          if (x !== undefined && !isNaN(x)) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
          if (y !== undefined && !isNaN(y)) {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      });

      const width = maxX - minX;
      const height = maxY - minY;

      if (width <= 0 || height <= 0) return;

      const centerX = minX + width / 2;
      const centerY = minY + height / 2;

      // Scale dynamically to fit the target box (width or height bound)
      const scale = Math.min(targetW / width, targetH / height);

      // Centering formula (PDF Y axis is inverted relative to SVG Y axis)
      const targetCenterX = targetX + targetW / 2;
      const targetCenterY = targetY + targetH / 2;

      const drawX = targetCenterX - (centerX * scale);
      const drawY = targetCenterY + (centerY * scale);

      paths.forEach(d => {
        page.drawSvgPath(d, {
          x: drawX,
          y: drawY,
          scale: scale,
          color: rgb(0, 0, 0),
          borderColor: rgb(0, 0, 0),
          borderWidth: 1.5,
        });
      });
    } catch (err) {
      console.error("[InternshipDocumentService.drawSvgSignature] Error drawing SVG paths:", err);
    }
  }

  private async resolveMentorSignature(mentorId: string, internshipId?: string) {
    // 1. Coba ambil dari cache database lokal terlebih dahulu!
    if (internshipId) {
      try {
        const [cachedInternship] = await this.db
          .select({
            base64: internships.mentorSignatureBase64,
            mimeType: internships.mentorSignatureMimeType,
          })
          .from(internships)
          .where(eq(internships.id, internshipId))
          .limit(1);

        if (cachedInternship?.base64) {
          const rawBase64 = cachedInternship.base64.trim();
          const mime = cachedInternship.mimeType || "image/svg+xml";

          if (mime.includes("svg") || rawBase64.startsWith("<svg") || rawBase64.includes("<svg")) {
            let svgText = rawBase64;
            if (!rawBase64.startsWith("<svg") && !rawBase64.includes("<svg")) {
              // Decode base64 to SVG text
              svgText = Buffer.from(rawBase64.replace(/^data:image\/svg\+xml;base64,/, ""), "base64").toString("utf-8");
            }

            // Gelapkan & pertebal tanda tangan SVG
            const styleInject = `
<style>
  svg, path, line, polyline, polygon, rect, circle {
    color: #000000 !important;
  }
  *[stroke]:not([stroke="none"]):not([stroke="transparent"]) {
    stroke: #000000 !important;
    stroke-width: 2.2px !important;
  }
  *[fill]:not([fill="none"]):not([fill="transparent"]) {
    fill: #000000 !important;
  }
</style>`;
            const svgOpenTagIndex = svgText.indexOf(">");
            if (svgOpenTagIndex !== -1) {
              svgText = svgText.slice(0, svgOpenTagIndex + 1) + styleInject + svgText.slice(svgOpenTagIndex + 1);
            }

            return {
              svg: svgText,
              mimeType: mime,
            };
          } else {
            // PNG/JPEG - convert base64 to buffer
            const cleanBase64 = rawBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
            return {
              mimeType: mime,
              pngOrJpegBuffer: Buffer.from(cleanBase64, "base64"),
            };
          }
        }
      } catch (err) {
        console.warn(
          `[InternshipDocumentService.resolveMentorSignature] Gagal mengambil cache TTD untuk internship ${internshipId}:`,
          err,
        );
      }
    }

    // 2. Fallback ke SSO jika belum dicache
    const session = await this.authSessionRepo.findSessionByMentorId(mentorId);
    const accessToken = session?.accessToken || null;
    if (!accessToken) return null;

    const signature =
      await this.ssoSignatureProxyService.getActiveSignatureByAccessToken(
        accessToken,
      );
    if (!signature) return null;

    let svgText = signature.svg;
    const styleInject = `
<style>
  svg, path, line, polyline, polygon, rect, circle {
    color: #000000 !important;
  }
  *[stroke]:not([stroke="none"]):not([stroke="transparent"]) {
    stroke: #000000 !important;
    stroke-width: 2.2px !important;
  }
  *[fill]:not([fill="none"]):not([fill="transparent"]) {
    fill: #000000 !important;
  }
</style>`;

    if (svgText) {
      const svgOpenTagIndex = svgText.indexOf(">");
      if (svgOpenTagIndex !== -1) {
        svgText = svgText.slice(0, svgOpenTagIndex + 1) + styleInject + svgText.slice(svgOpenTagIndex + 1);
      }
    }

    return {
      svg: svgText,
      mimeType: signature.mimeType,
    };
  }

  private async generateLogbookPDF(
    student: any,
    internship: any,
    mentor: any,
    mentorSignature: { svg?: string; mimeType?: string } | null,
    entries: any[],
    withSignature: boolean,
  ): Promise<Buffer> {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontNormal = await pdfDoc.embedFont(StandardFonts.TimesRoman);

    const formatDate = (value: string) =>
      new Date(value).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

    const getWeekNumber = (dateString: string, startDate: string) => {
      const date = new Date(dateString);
      const start = new Date(startDate);
      const diffTime = date.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.ceil((diffDays + 1) / 7);
    };

    const wrapText = (
      text: string,
      maxWidth: number,
      font: any,
      size: number,
    ) => {
      const words = text.split(" ");
      const lines: string[] = [];
      let current = "";

      words.forEach((word) => {
        const testLine = current ? `${current} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, size);
        if (width > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = testLine;
        }
      });

      if (current) lines.push(current);
      return lines.length > 0 ? lines : [""];
    };

    let page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { height } = page.getSize();
    let currentY = height - 60;

    // Title
    const title = "FORMULIR KEGIATAN HARIAN MAHASISWA";
    const titleWidth = fontBold.widthOfTextAtSize(title, 14);
    page.drawText(title, {
      x: (595.28 - titleWidth) / 2,
      y: currentY,
      size: 14,
      font: fontBold,
    });
    currentY -= 30;

    // Info block
    const labelX = 210;
    const colonX = 320;
    const valueX = 335;
    const infoFontSize = 11;
    const infoGap = 16;

    const infoRows = [
      { label: "Nama", value: student.profile.fullName },
      { label: "NIM", value: student.nim || "-" },
      { label: "Program Studi", value: student.prodi?.nama || "-" },
      { label: "Tempat KP", value: internship.company || "-" },
      { label: "Bagian/Bidang", value: internship.division || "-" },
    ];

    infoRows.forEach((row) => {
      page.drawText(row.label, {
        x: labelX,
        y: currentY,
        size: infoFontSize,
        font: fontNormal,
      });
      page.drawText(":", {
        x: colonX,
        y: currentY,
        size: infoFontSize,
        font: fontNormal,
      });
      page.drawText(row.value, {
        x: valueX,
        y: currentY,
        size: infoFontSize,
        font: fontNormal,
      });
      currentY -= infoGap;
    });

    currentY -= 10;

    // Table setup
    const tableWidth = 420;
    const tableX = (595.28 - tableWidth) / 2;
    const columnWidths = [60, 90, 200, 70];
    const colX = [tableX];
    columnWidths.forEach((width, index) => {
      colX[index + 1] = colX[index] + width;
    });

    const headerHeight = 28;
    const bodyFontSize = 10;
    const lineHeight = bodyFontSize + 3;

    const drawTableHeader = () => {
      page.drawRectangle({
        x: tableX,
        y: currentY - headerHeight,
        width: tableWidth,
        height: headerHeight,
        borderWidth: 1,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.2, 0.2, 0.2),
      });

      for (let i = 1; i < colX.length - 1; i += 1) {
        page.drawLine({
          start: { x: colX[i], y: currentY },
          end: { x: colX[i], y: currentY - headerHeight },
          thickness: 1,
          color: rgb(0.2, 0.2, 0.2),
        });
      }

      const headerCenter = currentY - headerHeight / 2;
      const centerTextX = (text: string, startX: number, width: number, size: number) => {
        const textWidth = fontBold.widthOfTextAtSize(text, size);
        return startX + (width - textWidth) / 2;
      };

      page.drawText("Minggu", {
        x: centerTextX("Minggu", colX[0], columnWidths[0], 10),
        y: headerCenter + 4,
        size: 10,
        font: fontBold,
      });
      page.drawText("Ke", {
        x: centerTextX("Ke", colX[0], columnWidths[0], 10),
        y: headerCenter - 8,
        size: 10,
        font: fontBold,
      });
      page.drawText("Tanggal", {
        x: centerTextX("Tanggal", colX[1], columnWidths[1], 10),
        y: headerCenter - 4,
        size: 10,
        font: fontBold,
      });
      page.drawText("Jenis Kegiatan", {
        x: centerTextX("Jenis Kegiatan", colX[2], columnWidths[2], 10),
        y: headerCenter - 4,
        size: 10,
        font: fontBold,
      });
      const parafLines = ["Paraf", "Pembimbing", "Lapangan"];
      parafLines.forEach((line, idx) => {
        page.drawText(line, {
          x: centerTextX(line, colX[3], columnWidths[3], 9),
          y: headerCenter + 8 - idx * 10,
          size: 9,
          font: fontBold,
        });
      });

      currentY -= headerHeight;
    };

    drawTableHeader();

    let signatureImage: any = null;
    if (withSignature) {
      if (!mentorSignature?.svg && (mentorSignature as any)?.pngOrJpegBuffer) {
        try {
          signatureImage = await this.embedImageToPdf(
            pdfDoc,
            (mentorSignature as any).pngOrJpegBuffer,
          );
        } catch (e) {
          console.error(
            "[InternshipDocumentService] Failed to embed cached PNG/JPEG signature to Logbook PDF:",
            e,
          );
        }
      }
    }

    const sortedEntries = [...entries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const startDate = internship.internshipStartDate || internship.startDate;
    type RowData = {
      entry: any;
      weekNumber: string | number;
      activityLines: string[];
      rowHeight: number;
    };

    const rows: RowData[] = sortedEntries.map((entry) => {
      const activityText = entry.description || entry.activity || "";
      const activityLines = wrapText(
        activityText,
        columnWidths[2] - 12,
        fontNormal,
        bodyFontSize,
      );
      const rowHeight = Math.max(activityLines.length * lineHeight, 20) + 8;
      const weekNumber = startDate
        ? getWeekNumber(entry.date, startDate)
        : "-";

      return {
        entry,
        weekNumber,
        activityLines,
        rowHeight,
      };
    });

    let rowIndex = 0;
    while (rowIndex < rows.length) {
      const groupWeek = rows[rowIndex].weekNumber;
      const groupStartIndex = rowIndex;
      let groupEndIndex = rowIndex;

      while (
        groupEndIndex + 1 < rows.length &&
        rows[groupEndIndex + 1].weekNumber === groupWeek
      ) {
        groupEndIndex += 1;
      }

      const groupRows = rows.slice(groupStartIndex, groupEndIndex + 1);
      const groupHeight = groupRows.reduce(
        (sum, row) => sum + row.rowHeight,
        0,
      );

      if (currentY - groupHeight < 110) {
        page = pdfDoc.addPage([595.28, 841.89]);
        currentY = height - 60;
        drawTableHeader();
      }

      const groupTopY = currentY;

      for (const row of groupRows) {
        page.drawRectangle({
          x: tableX,
          y: currentY - row.rowHeight,
          width: tableWidth,
          height: row.rowHeight,
          borderWidth: 1,
          color: rgb(1, 1, 1),
          borderColor: rgb(0.2, 0.2, 0.2),
        });

        for (let i = 1; i < colX.length - 1; i += 1) {
          page.drawLine({
            start: { x: colX[i], y: currentY },
            end: { x: colX[i], y: currentY - row.rowHeight },
            thickness: 1,
            color: rgb(0.2, 0.2, 0.2),
          });
        }

        page.drawText(formatDate(row.entry.date), {
          x: colX[1] + 8,
          y: currentY - 18,
          size: bodyFontSize,
          font: fontNormal,
        });

        row.activityLines.forEach((line, index) => {
          page.drawText(line, {
            x: colX[2] + 6,
            y: currentY - 18 - index * lineHeight,
            size: bodyFontSize,
            font: fontNormal,
          });
        });

        const statusText = String(row.entry.status || "").toUpperCase();
        const isApproved =
          statusText === "APPROVED" ||
          statusText === "DISETUJUI" ||
          Boolean(row.entry.verifiedAt);

        if (isApproved) {
          if (mentorSignature?.svg) {
            await this.drawSvgSignature(
              page,
              mentorSignature.svg,
              colX[3] + 8,
              currentY - row.rowHeight + 6,
              columnWidths[3] - 16,
              row.rowHeight - 12,
            );
          } else if (signatureImage) {
            const sigDims = signatureImage.scaleToFit(50, 16);
            page.drawImage(signatureImage, {
              x: colX[3] + (columnWidths[3] - sigDims.width) / 2,
              y: currentY - row.rowHeight + (row.rowHeight - sigDims.height) / 2,
              width: sigDims.width,
              height: sigDims.height,
            });
          }
        }

        currentY -= row.rowHeight;
      }

      page.drawRectangle({
        x: colX[0],
        y: groupTopY - groupHeight,
        width: columnWidths[0],
        height: groupHeight,
        borderWidth: 1,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.2, 0.2, 0.2),
      });

      const weekText = String(groupWeek);
      const weekTextWidth = fontBold.widthOfTextAtSize(weekText, bodyFontSize);
      page.drawText(weekText, {
        x: colX[0] + (columnWidths[0] - weekTextWidth) / 2,
        y: groupTopY - groupHeight / 2,
        size: bodyFontSize,
        font: fontBold,
      });

      rowIndex = groupEndIndex + 1;
    }

    // Footer signature block
    if (currentY < 120) {
      page = pdfDoc.addPage([595.28, 841.89]);
      currentY = height - 60;
    }

    const lastDate = sortedEntries.at(-1)?.date || new Date().toISOString();
    const footerDate = formatDate(lastDate);

    currentY -= 10;
    page.drawText(`Palembang, ${footerDate}`, {
      x: 340,
      y: currentY,
      size: 10,
      font: fontNormal,
    });
    currentY -= 14;
    page.drawText("Pembimbing Lapangan,", {
      x: 340,
      y: currentY,
      size: 10,
      font: fontNormal,
    });

    currentY -= 80;
    if (withSignature) {
      if (mentorSignature?.svg) {
        await this.drawSvgSignature(
          page,
          mentorSignature.svg,
          340,
          currentY + 22,
          120,
          45,
        );
      } else if (signatureImage) {
        const sigDims = signatureImage.scaleToFit(120, 45);
        page.drawImage(signatureImage, {
          x: 360,
          y: currentY + 22,
          width: sigDims.width,
          height: sigDims.height,
        });
      }
    }

    page.drawText(mentor?.fullName || "(....................)", {
      x: 340,
      y: currentY,
      size: 10,
      font: fontBold,
    });
    if (mentor?.position) {
      currentY -= 12;
      page.drawText(mentor.position, {
        x: 340,
        y: currentY,
        size: 9,
        font: fontNormal,
      });
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
    mentorSignature: {
      svg?: string;
      mimeType?: string;
      pngOrJpegBuffer?: Buffer;
    } | null,
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

    currentY -= 80;
    const nameY = currentY;
    page.drawText(mentor?.fullName || "(....................)", {
      x: 400,
      y: nameY,
      size: 10,
      font: fontNormal,
    });
    if (mentor?.position) {
      currentY -= 12;
      page.drawText(mentor.position, {
        x: 400,
        y: currentY,
        size: 9,
        font: fontNormal,
      });
    }

    if (withSignature) {
      let rendered = false;

      if (mentorSignature?.svg) {
        try {
          await this.drawSvgSignature(
            page,
            mentorSignature.svg,
            400,
            nameY + 22,
            120,
            45,
          );
          rendered = true;
        } catch (e) {
          console.error(
            "[InternshipDocumentService] Failed to draw SVG signature to Assessment PDF:",
            e,
          );
        }
      }

      if (!rendered && mentorSignature?.pngOrJpegBuffer) {
        try {
          const sigImage = await this.embedImageToPdf(
            pdfDoc,
            mentorSignature.pngOrJpegBuffer,
          );
          const sigDims = sigImage.scaleToFit(120, 45);
          page.drawImage(sigImage, {
            x: 400,
            y: nameY + 22,
            width: sigDims.width,
            height: sigDims.height,
          });
          rendered = true;
        } catch (e) {
          console.error(
            "[InternshipDocumentService] Failed to embed cached PNG/JPEG signature to Assessment PDF:",
            e,
          );
        }
      }

      if (!rendered && mentor?.signatureUrl) {
        const sigBuffer = await this.fetchImageBuffer(mentor.signatureUrl);
        if (sigBuffer) {
          try {
            const sigImage = await this.embedImageToPdf(pdfDoc, sigBuffer);
            const sigDims = sigImage.scaleToFit(120, 45);
            page.drawImage(sigImage, {
              x: 400,
              y: nameY + 22,
              width: sigDims.width,
              height: sigDims.height,
            });
            rendered = true;
          } catch (e) {
            console.error(
              "[InternshipDocumentService] Failed to embed signature to Assessment PDF:",
              e,
            );
          }
        }
      }

      if (!rendered) {
        page.drawText("[Gagal Memuat Tanda Tangan Digital]", {
          x: 400,
          y: nameY + 20,
          size: 8,
          font: fontNormal,
          color: rgb(1, 0, 0),
        });
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
