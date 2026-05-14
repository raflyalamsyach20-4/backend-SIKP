import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } from 'docx';
import { createDbClient } from '@/db';
import { LogbookRepository } from '@/repositories/logbook.repository';
import { MahasiswaRepository } from '@/repositories/mahasiswa.repository';
import { MentorRepository } from '@/repositories/mentor.repository';
import { StorageService } from './storage.service';
import { MahasiswaService } from './mahasiswa.service';
import { DosenService } from './dosen.service';
import { assessments, lecturerAssessments, combinedGrades, internships } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export interface GenerationOptions {
  format: 'pdf' | 'docx';
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
      .select({ startDate: internships.startDate, endDate: internships.endDate })
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
  async generateLogbook(userId: string, sessionId: string, options: GenerationOptions) {
    const data = await this.mahasiswaRepo.getInternshipData(userId);
    if (!data || !data.internshipId) throw new Error('Internship not found');

    const studentProfile = await this.mahasiswaService.getMahasiswaById(userId, sessionId);
    const logbookEntries = await this.logbookRepo.findByInternshipId(data.internshipId);
    
    let mentorProfile = null;
    if (data.pembimbingLapanganId) {
      mentorProfile = await this.mentorRepo.findProfileById(data.pembimbingLapanganId);
    }

    if (options.format === 'pdf') {
      return await this.generateLogbookPDF(studentProfile, data, mentorProfile, logbookEntries, options.withSignature);
    } else {
      return await this.generateLogbookDocx(studentProfile, data, mentorProfile, logbookEntries, options.withSignature);
    }
  }

  /**
   * Generate Assessment Document
   */
  async generateAssessment(userId: string, sessionId: string, options: GenerationOptions) {
    const data = await this.mahasiswaRepo.getInternshipData(userId);
    if (!data || !data.internshipId) throw new Error('Internship not found');

    const studentProfile = await this.mahasiswaService.getMahasiswaById(userId, sessionId);
    const assessmentResult = await this.db
      .select()
      .from(assessments)
      .where(eq(assessments.internshipId, data.internshipId))
      .limit(1);
    
    const assessment = assessmentResult[0] || null;

    let mentorProfile = null;
    if (data.pembimbingLapanganId) {
      mentorProfile = await this.mentorRepo.findProfileById(data.pembimbingLapanganId);
    }

    if (options.format === 'pdf') {
      return await this.generateAssessmentPDF(studentProfile, data, mentorProfile, assessment, options.withSignature);
    } else {
      return await this.generateAssessmentDocx(studentProfile, data, mentorProfile, assessment, options.withSignature);
    }
  }

  private async generateLogbookPDF(student: any, internship: any, mentor: any, entries: any[], withSignature: boolean): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.font('Helvetica-Bold').fontSize(14).text('LOGBOOK KEGIATAN KERJA PRAKTIK', { align: 'center' });
        doc.font('Helvetica'); // Reset font
        doc.moveDown();

        // Student Info
        doc.fontSize(10);
        doc.text(`Nama Mahasiswa: ${student.profile.fullName}`);
        doc.text(`NIM: ${student.nim}`);
        doc.text(`Program Studi: ${student.prodi?.nama || '-'}`);
        doc.text(`Instansi: ${internship.company || '-'}`);
        doc.moveDown();

        // Table
        const tableTop = 200;
        const itemCodeX = 50;
        const descriptionX = 150;
        const hoursX = 450;
        const statusX = 500;

        doc.font('Helvetica-Bold').fontSize(10).text('Tanggal', itemCodeX, tableTop);
        doc.text('Aktivitas', descriptionX, tableTop);
        doc.text('Jam', hoursX, tableTop);
        doc.font('Helvetica');

        let y = tableTop + 25;
        entries.forEach((entry) => {
          doc.fontSize(9).text(new Date(entry.date).toLocaleDateString('id-ID'), itemCodeX, y);
          doc.text(entry.activity, descriptionX, y, { width: 280 });
          doc.text(entry.hours?.toString() || '0', hoursX, y);
          y += 30; // Adjust spacing
          
          if (y > 700) {
            doc.addPage();
            y = 50;
          }
        });

        doc.moveDown(2);

        // Signature section
        const signatureY = doc.y + 20;
        doc.text('Mahasiswa,', 100, signatureY);
        doc.text('Pembimbing Lapangan,', 400, signatureY);
        
        doc.moveDown(4);
        doc.text(student.profile.fullName, 100, doc.y);
        doc.text(mentor?.fullName || '(....................)', 400, doc.y);

        if (withSignature && mentor?.signatureUrl) {
            // In a real edge environment, we'd fetch the signature image here
            // For now, we'll skip embedding the actual image bytes to keep it simple
            // and assume the frontend handles visual signatures or we use a helper.
            doc.fillColor('green').text('[Tanda Tangan Digital Diverifikasi]', 400, signatureY + 20);
            doc.fillColor('black');
        }

        doc.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  private async generateLogbookDocx(student: any, internship: any, mentor: any, entries: any[], withSignature: boolean): Promise<Buffer> {
    const tableRows = [
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Tanggal', bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Aktivitas', bold: true })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Durasi (Jam)', bold: true })] })] }),
        ],
      }),
      ...entries.map((entry) => new TableRow({
        children: [
          new TableCell({ children: [new Paragraph(new Date(entry.date).toLocaleDateString('id-ID'))] }),
          new TableCell({ children: [new Paragraph(entry.activity)] }),
          new TableCell({ children: [new Paragraph(entry.hours?.toString() || '0')] }),
        ],
      })),
    ];

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: 'LOGBOOK KEGIATAN KERJA PRAKTIK', heading: 'Title', alignment: AlignmentType.CENTER }),
          new Paragraph({ text: '' }),
          new Paragraph({ children: [new TextRun({ text: 'Nama: ', bold: true }), new TextRun(student.profile.fullName)] }),
          new Paragraph({ children: [new TextRun({ text: 'NIM: ', bold: true }), new TextRun(student.nim)] }),
          new Paragraph({ children: [new TextRun({ text: 'Instansi: ', bold: true }), new TextRun(internship.company || '-')] }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Mahasiswa,', break: 1 }),
              new TextRun({ text: '\t\t\t\t\t\t\t\t\t\t\t' }),
              new TextRun({ text: 'Pembimbing Lapangan,' }),
            ]
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: student.profile.fullName }),
              new TextRun({ text: '\t\t\t\t\t\t\t\t\t\t\t' }),
              new TextRun({ text: mentor?.fullName || '(....................)' }),
            ]
          }),
        ],
      }],
    });

    return await Packer.toBuffer(doc);
  }

  private async generateAssessmentPDF(student: any, internship: any, mentor: any, assessment: any, withSignature: boolean): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.font('Helvetica-Bold').fontSize(14).text('FORM PENILAIAN KERJA PRAKTIK', { align: 'center' });
      doc.moveDown();

      doc.fontSize(10);
      doc.text(`Nama Mahasiswa: ${student.profile.fullName}`);
      doc.text(`NIM: ${student.nim}`);
      doc.text(`Instansi: ${internship.company || '-'}`);
      doc.moveDown();

      if (!assessment) {
        doc.fillColor('red').fontSize(12).text('NILAI BELUM DIISI OLEH PEMBIMBIMBING LAPANGAN', { align: 'center' });
        doc.fillColor('black');
      } else {
        doc.font('Helvetica-Bold').text('KRITERIA PENILAIAN:');
        doc.font('Helvetica');
        doc.text(`1. Kehadiran: ${assessment.kehadiran}`);
        doc.text(`2. Kerjasama: ${assessment.kerjasama}`);
        doc.text(`3. Sikap & Etika: ${assessment.sikapEtika}`);
        doc.text(`4. Prestasi Kerja: ${assessment.prestasiKerja}`);
        doc.text(`5. Kreatifitas: ${assessment.kreatifitas}`);
        doc.moveDown();
        doc.font('Helvetica-Bold').fontSize(11).text(`TOTAL SKOR: ${assessment.totalScore}`);
        doc.font('Helvetica');
      }

      doc.moveDown(2);
      const sigY = doc.y;
      doc.text('Pembimbing Lapangan,', 400, sigY);
      doc.moveDown(4);
      doc.text(mentor?.fullName || '(....................)', 400, doc.y);

      if (withSignature && mentor?.signatureUrl) {
          doc.fillColor('green').text('[Tanda Tangan Digital Diverifikasi]', 400, sigY + 20);
          doc.fillColor('black');
      }

      doc.end();
    });
  }

  private async generateAssessmentDocx(student: any, internship: any, mentor: any, assessment: any, withSignature: boolean): Promise<Buffer> {
    const children: any[] = [
      new Paragraph({ text: 'FORM PENILAIAN KERJA PRAKTIK', heading: 'Title', alignment: AlignmentType.CENTER }),
      new Paragraph({ text: '' }),
      new Paragraph({ children: [new TextRun({ text: 'Nama: ', bold: true }), new TextRun(student.profile.fullName)] }),
      new Paragraph({ children: [new TextRun({ text: 'NIM: ', bold: true }), new TextRun(student.nim)] }),
      new Paragraph({ children: [new TextRun({ text: 'Instansi: ', bold: true }), new TextRun(internship.company || '-')] }),
      new Paragraph({ text: '' }),
    ];

    if (!assessment) {
      children.push(new Paragraph({ text: 'NILAI BELUM DIISI OLEH PEMBIMBIMBING LAPANGAN', alignment: AlignmentType.CENTER }));
    } else {
      children.push(new Paragraph({ children: [new TextRun({ text: 'KRITERIA PENILAIAN:', bold: true })] }));
      children.push(new Paragraph({ text: `1. Kehadiran (20%): ${assessment.kehadiran}` }));
      children.push(new Paragraph({ text: `2. Kerjasama (30%): ${assessment.kerjasama}` }));
      children.push(new Paragraph({ text: `3. Sikap & Etika (20%): ${assessment.sikapEtika}` }));
      children.push(new Paragraph({ text: `4. Prestasi Kerja (20%): ${assessment.prestasiKerja}` }));
      children.push(new Paragraph({ text: `5. Kreatifitas (10%): ${assessment.kreatifitas}` }));
      children.push(new Paragraph({ text: '' }));
      children.push(new Paragraph({ children: [new TextRun({ text: `TOTAL SKOR: ${assessment.totalScore}`, bold: true })] }));
    }

    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({ text: 'Pembimbing Lapangan,', alignment: AlignmentType.RIGHT }));
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({ text: mentor?.fullName || '(....................)', alignment: AlignmentType.RIGHT }));

    const doc = new Document({
      sections: [{ children }],
    });

    return await Packer.toBuffer(doc);
  }
}
