import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { StorageService } from './storage.service';
import { generateId } from '@/utils/helpers';

export class LetterService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private storageService: StorageService
  ) {}

  async generateLetter(submissionId: string, adminId: string, format: 'pdf' | 'docx' = 'pdf') {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status !== 'DITERIMA') {
      throw new Error('Can only generate letter for approved submissions');
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
      generatedBy: adminId,
    });

    return letter;
  }

  private async generatePDF(submission: any, letterNumber: string): Promise<Buffer> {
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
      doc.text(`Posisi: ${submission.position || '-'}`);
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

  private async generateDOCX(submission: any, letterNumber: string): Promise<Buffer> {
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
              text: 'SURAT PENGANTAR KERJA PRAKTIK',
              alignment: 'center',
              bold: true,
            }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Kepada Yth.' }),
            new Paragraph({ text: submission.companyName }),
            new Paragraph({ text: submission.companyAddress }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Dengan hormat,' }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'Dengan ini kami mengajukan permohonan kepada Bapak/Ibu untuk dapat menerima mahasiswa kami untuk melaksanakan Kerja Praktik di perusahaan yang Bapak/Ibu pimpin.',
            }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Adapun data mahasiswa tersebut adalah:' }),
            new Paragraph({ text: `Tim: ${submission.teamId}` }),
            new Paragraph({ text: `Posisi: ${submission.position || '-'}` }),
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
