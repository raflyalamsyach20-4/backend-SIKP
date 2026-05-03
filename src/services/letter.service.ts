import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { StorageService } from './storage.service';
import { generateId } from '@/utils/helpers';
import { createDbClient } from '@/db';

type LetterSubmission = {
  id: string;
  teamId: string;
  companyName: string | null;
  companyAddress: string | null;
  division?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  adminVerificationStatus?: string | null;
  status?: string | null;
};

export class LetterService {
  private submissionRepo: SubmissionRepository;
  private storageService: StorageService;

  constructor(
    private env: CloudflareBindings
  ) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.submissionRepo = new SubmissionRepository(db);
    this.storageService = new StorageService(this.env);
  }

  async generateLetter(submissionId: string, adminId: string, format: 'pdf' | 'docx' = 'pdf') {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    const adminApproved = submission.adminVerificationStatus === 'APPROVED' || submission.status === 'APPROVED';
    if (!adminApproved) {
      throw new Error('Can only generate letter for admin-approved submissions');
    }

    // Generate letter number
    const letterNumber = await this.generateLetterNumber();

    // Generate letter content
    let fileBuffer: Buffer;
    let fileName: string;

    if (format === 'pdf') {
      fileBuffer = await this.generatePDF(submission, letterNumber);
      fileName = `surat-pengantar-${submission.id}.pdf`;
    } else {
      fileBuffer = await this.generateDOCX(submission, letterNumber);
      fileName = `surat-pengantar-${submission.id}.docx`;
    }

    // Upload to R2
    const { url, key } = await this.storageService.uploadFile(
      fileBuffer,
      fileName,
      'letters'
    );

    // Save to database
    const letter = await this.submissionRepo.addGeneratedLetter({
      id: generateId(),
      submissionId,
      letterNumber,
      fileName,
      fileUrl: url,
      fileType: format.toUpperCase(),
      generatedByAdminId: adminId,
    });

    return letter;
  }

  /**
   * Generate final signed cover letter with wakil dekan e-signature
   * Called automatically when wakil dekan approves response letter
   * @param submissionId - Submission ID
   * @param verifiedByAdminId - Admin/wakil dekan ID who verified
   * @returns Generated letter record with R2 URL
   */
  async generateFinalSignedLetter(submissionId: string, verifiedByAdminId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    // Check if letter already exists for this submission
    const existingLetters = await this.submissionRepo.findLettersBySubmissionId(submissionId);
    if (existingLetters && existingLetters.length > 0) {
      console.log('[generateFinalSignedLetter] Letter already exists for submission, returning existing:', existingLetters[0].id);
      return existingLetters[0];
    }

    // Use the letter number from submission if already stored (from admin approval)
    const letterNumber = submission.letterNumber || await this.generateLetterNumber();

    // Get wakil dekan signature
    const wakilDekanSig = await this.submissionRepo.findWakilDekanSignature();

    // Generate PDF with signature
    const fileBuffer = await this.generateSignedPDF(submission, letterNumber, wakilDekanSig);
    
    const timestamp = Date.now();
    const fileName = `surat-pengantar-${submission.id}-signed-${timestamp}.pdf`;

    // Upload to R2
    const { url } = await this.storageService.uploadFile(
      fileBuffer,
      fileName,
      'letters'
    );

    // Save to database
    const letter = await this.submissionRepo.addGeneratedLetter({
      id: generateId(),
      submissionId,
      letterNumber,
      fileName,
      fileUrl: url,
      fileType: 'PDF',
      generatedByAdminId: verifiedByAdminId,
    });

    // Update submission's finalSignedFileUrl
    await this.submissionRepo.update(submissionId, {
      finalSignedFileUrl: url,
    });

    console.log('[generateFinalSignedLetter] Final signed letter created:', {
      letterId: letter.id,
      submissionId,
      fileUrl: url,
      fileName,
    });

    return letter;
  }

  /**
   * Generate PDF with wakil dekan e-signature included
   * This is the final signed version sent to students and company
   */
  private async generateSignedPDF(
    submission: LetterSubmission,
    letterNumber: string,
    wakilDekanSignature: {
      id: string;
      name: string;
      nip: string;
      position: string;
      esignatureUrl?: string;
    } | null
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(12).text('UNIVERSITAS SRIWIJAYA', { align: 'center' });
      doc.fontSize(10).text('Fakultas Teknik', { align: 'center' });
      doc.moveDown();

      // Letter Number and Date
      doc.fontSize(10);
      doc.text(`Nomor: ${letterNumber}`, { align: 'left' });
      doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, { align: 'left' });
      doc.moveDown();

      // Title
      doc.fontSize(14).text('SURAT PENGANTAR KERJA PRAKTIK', { align: 'center', underline: true });
      doc.moveDown(2);

      // Content
      doc.fontSize(11);
      doc.text('Kepada Yth.');
      doc.text(`${submission.companyName || 'Pimpinan Perusahaan'}`);
      doc.text(`${submission.companyAddress || ''}`);
      doc.moveDown();

      doc.text('Dengan hormat,');
      doc.moveDown();

      doc.text(
        'Dengan ini kami mengajukan permohonan kepada Bapak/Ibu untuk dapat menerima mahasiswa kami untuk melaksanakan Kerja Praktik di perusahaan yang Bapak/Ibu pimpin.',
        { align: 'justify' }
      );
      doc.moveDown();

      // Team members info
      doc.text('Adapun data mahasiswa tersebut adalah:');
      doc.text(`Tim: ${submission.teamId}`);
      doc.text(`Posisi: ${submission.division || '-'}`);
      if (submission.startDate || submission.endDate) {
        const startStr = submission.startDate ? new Date(submission.startDate).toLocaleDateString('id-ID') : '-';
        const endStr = submission.endDate ? new Date(submission.endDate).toLocaleDateString('id-ID') : '-';
        doc.text(`Periode: ${startStr} s/d ${endStr}`);
      }
      doc.moveDown();

      doc.text(
        'Demikian surat pengantar ini kami sampaikan, atas perhatian dan kerjasamanya kami ucapkan terima kasih.',
        { align: 'justify' }
      );
      doc.moveDown(4);

      // Signature block with e-signature
      doc.text('Hormat kami,', { align: 'right' });
      doc.moveDown();

      if (wakilDekanSignature?.esignatureUrl) {
        try {
          // Add e-signature image if available
          doc.image(wakilDekanSignature.esignatureUrl, { width: 100, align: 'right' });
          doc.moveDown();
        } catch (err) {
          console.warn('[generateSignedPDF] Could not add e-signature image:', err);
          doc.moveDown(3);
        }
      } else {
        doc.moveDown(3);
      }

      // Signatory info
      doc.fontSize(10);
      doc.text(wakilDekanSignature?.name || '[Nama Pejabat]', { align: 'right' });
      doc.text(`NIP: ${wakilDekanSignature?.nip || '[NIP]'}`, { align: 'right' });
      doc.text(wakilDekanSignature?.position || '[Jabatan]', { align: 'right' });

      // Footer timestamp
      doc.moveDown(3);
      doc.fontSize(8).text(`Generated: ${new Date().toISOString()}`, { align: 'center' });

      doc.end();
    });
  }

  private async generatePDF(submission: LetterSubmission, letterNumber: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(12).text('UNIVERSITAS [NAMA UNIVERSITAS]', { align: 'center' });
      doc.fontSize(10).text('Fakultas [Nama Fakultas]', { align: 'center' });
      doc.moveDown();

      // Letter Number and Date
      doc.fontSize(10);
      doc.text(`Nomor: ${letterNumber}`, { align: 'left' });
      doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, { align: 'left' });
      doc.moveDown();

      // Title
      doc.fontSize(14).text('SURAT PENGANTAR KERJA PRAKTIK', { align: 'center', underline: true });
      doc.moveDown(2);

      // Content
      doc.fontSize(11);
      doc.text('Kepada Yth.');
      doc.text(`${submission.companyName}`);
      doc.text(`${submission.companyAddress}`);
      doc.moveDown();

      doc.text('Dengan hormat,');
      doc.moveDown();

      doc.text(
        `Dengan ini kami mengajukan permohonan kepada Bapak/Ibu untuk dapat menerima mahasiswa kami untuk melaksanakan Kerja Praktik di perusahaan yang Bapak/Ibu pimpin.`,
        { align: 'justify' }
      );
      doc.moveDown();

      // Team members info would go here
      doc.text('Adapun data mahasiswa tersebut adalah:');
      doc.text(`Tim: ${submission.teamId}`);
      doc.text(`Posisi: ${submission.division || '-'}`);
      doc.text(`Periode: ${submission.startDate ? new Date(submission.startDate).toLocaleDateString('id-ID') : '-'} s/d ${submission.endDate ? new Date(submission.endDate).toLocaleDateString('id-ID') : '-'}`);
      doc.moveDown();

      doc.text(
        'Demikian surat pengantar ini kami sampaikan, atas perhatian dan kerjasamanya kami ucapkan terima kasih.',
        { align: 'justify' }
      );
      doc.moveDown(2);

      // Signature
      doc.text('Hormat kami,', { align: 'right' });
      doc.moveDown(3);
      doc.text('[Nama Pejabat]', { align: 'right' });
      doc.text('[Jabatan]', { align: 'right' });

      doc.end();
    });
  }

  private async generateDOCX(submission: LetterSubmission, letterNumber: string): Promise<Buffer> {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: 'UNIVERSITAS [NAMA UNIVERSITAS]',
              alignment: 'center',
            }),
            new Paragraph({
              text: 'Fakultas [Nama Fakultas]',
              alignment: 'center',
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              children: [
                new TextRun(`Nomor: ${letterNumber}`),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`),
              ],
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              children: [
                new TextRun({
                  text: 'SURAT PENGANTAR KERJA PRAKTIK',
                  bold: true,
                }),
              ],
              alignment: 'center',
            }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Kepada Yth.' }),
            new Paragraph({ text: submission.companyName ?? '' }),
            new Paragraph({ text: submission.companyAddress ?? '' }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Dengan hormat,' }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'Dengan ini kami mengajukan permohonan kepada Bapak/Ibu untuk dapat menerima mahasiswa kami untuk melaksanakan Kerja Praktik di perusahaan yang Bapak/Ibu pimpin.',
            }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Adapun data mahasiswa tersebut adalah:' }),
            new Paragraph({ text: `Tim: ${submission.teamId}` }),
            new Paragraph({ text: `Posisi: ${submission.division || '-'}` }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'Demikian surat pengantar ini kami sampaikan, atas perhatian dan kerjasamanya kami ucapkan terima kasih.',
            }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Hormat kami,' }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: '[Nama Pejabat]' }),
            new Paragraph({ text: '[Jabatan]' }),
          ],
        },
      ],
    });

    return await Packer.toBuffer(doc);
  }

  private async generateLetterNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    
    // Generate sequential number (in production, this should be atomic)
    const randomNum = Math.floor(Math.random() * 9000) + 1000;
    
    return `${randomNum}/KP/FT/${month}/${year}`;
  }

  async getLetterBySubmissionId(submissionId: string) {
    return await this.submissionRepo.findLettersBySubmissionId(submissionId);
  }
}
