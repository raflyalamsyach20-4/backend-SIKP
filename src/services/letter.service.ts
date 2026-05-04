import PDFDocument from 'pdfkit';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { MahasiswaService } from '@/services/mahasiswa.service';
import { DosenService } from '@/services/dosen.service';
import { SsoSignatureProxyService } from '@/services/sso-signature-proxy.service';
import { StorageService } from './storage.service';
import { generateId } from '@/utils/helpers';
import { createDbClient } from '@/db';
import { UNSRI_LOGO_BASE64 } from '@/constants/unsri-logo.base64';

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
  letterNumber?: string | null;
  submittedAt?: string | Date | null;
  createdAt?: string | Date | null;
  approvedAt?: string | Date | null;
  letterPurpose?: string | null;
};

type SuratPengantarPdfEntry = {
  id: string;
  tanggal: string;
  nim: string;
  namaMahasiswa: string;
  programStudi: string;
  status: 'menunggu' | 'disetujui' | 'ditolak';
  supervisor?: string;
  teamMembers?: Array<{
    id: string;
    name: string;
    nim?: string;
    prodi?: string;
    role: string;
  }>;
  namaPerusahaan?: string;
  tujuanSurat?: string;
  alamatPerusahaan?: string;
  divisi?: string;
  tanggalMulai?: string;
  tanggalSelesai?: string;
  nomorSurat?: string;
  dosenNama?: string;
  dosenNip?: string;
  dosenJabatan?: string;
  dosenEsignatureUrl?: string;
  dosenEsignatureSvg?: string;
  approvedAt?: string;
};

type WakilDekanSignature = {
  id: string;
  name: string;
  nip: string;
  position: string;
  esignatureUrl?: string;
} | null;

export class LetterService {
  private submissionRepo: SubmissionRepository;
  private teamRepo: TeamRepository;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;
  private ssoSignatureProxyService: SsoSignatureProxyService;
  private storageService: StorageService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.submissionRepo = new SubmissionRepository(db);
    this.teamRepo = new TeamRepository(db);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.dosenService = new DosenService(this.env);
    this.ssoSignatureProxyService = new SsoSignatureProxyService(this.env);
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

    const letterNumber = await this.generateLetterNumber();

    let fileBuffer: Buffer;
    let fileName: string;

    if (format === 'pdf') {
      fileBuffer = await this.generatePDF(submission, letterNumber);
      fileName = `surat-pengantar-${submission.id}.pdf`;
    } else {
      fileBuffer = await this.generateDOCX(submission, letterNumber);
      fileName = `surat-pengantar-${submission.id}.docx`;
    }

    const { url } = await this.storageService.uploadFile(fileBuffer, fileName, 'letters');

    return await this.submissionRepo.addGeneratedLetter({
      id: generateId(),
      submissionId,
      letterNumber,
      fileName,
      fileUrl: url,
      fileType: format.toUpperCase(),
      generatedByAdminId: adminId,
    });
  }

  async generateCoverLetterDocument(submissionId: string, adminId: string, letterNumber?: string | null, sessionId: string = '') {
    const submission = await this.submissionRepo.findByIdWithTeam(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    const adminApproved = submission.adminVerificationStatus === 'APPROVED' || submission.status === 'APPROVED';
    if (!adminApproved) {
      throw new Error('Can only generate cover letter for admin-approved submissions');
    }

    const existingDocs = await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
    const existingCoverLetter = existingDocs.find(
      (doc) => doc.documentType === 'SURAT_PENGANTAR' && doc.fileUrl && !doc.fileUrl.startsWith('/uploads/')
    );
    if (existingCoverLetter) {
      return existingCoverLetter;
    }

    const normalizedLetterNumber = letterNumber || submission.letterNumber || await this.generateLetterNumber();
    const wakilDekanSig = await this.submissionRepo.findWakilDekanSignature();
    const pdfEntry = await this.buildSuratPengantarPdfEntry(submission, normalizedLetterNumber, wakilDekanSig, 'menunggu', sessionId);
    const fileBuffer = await this.generateSuratPengantarPdf(pdfEntry);
    const timestamp = Date.now();
    const fileName = `Surat_Pengantar_Kerja_Praktik_${submission.teamId}_${timestamp}.pdf`;

    const { url } = await this.storageService.uploadFile(fileBuffer, fileName, 'submissions');

    return await this.submissionRepo.addDocument({
      id: generateId(),
      submissionId,
      documentType: 'SURAT_PENGANTAR',
      memberMahasiswaId: adminId,
      uploadedByMahasiswaId: adminId,
      originalName: `Surat_Pengantar_Kerja_Praktik_${submission.teamId}.pdf`,
      fileName,
      fileType: 'application/pdf',
      fileSize: fileBuffer.length,
      fileUrl: url,
      createdAt: new Date(),
    });
  }

  async generateFinalSignedLetter(submissionId: string, verifiedByAdminId: string, sessionId: string = '') {
    const submission = await this.submissionRepo.findByIdWithTeam(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    const existingLetters = await this.submissionRepo.findLettersBySubmissionId(submissionId);
    const existingSignedLetter = existingLetters.find((letter) => {
      const lower = (letter.fileName || '').toLowerCase();
      return lower.includes('-signed-') || lower.includes('final');
    });
    if (existingSignedLetter) {
      return existingSignedLetter;
    }

    const letterNumber = submission.letterNumber || await this.generateLetterNumber();
    const wakilDekanSig = await this.submissionRepo.findWakilDekanSignature();
    const pdfEntry = await this.buildSuratPengantarPdfEntry(submission, letterNumber, wakilDekanSig, 'disetujui', sessionId);
    const fileBuffer = await this.generateSuratPengantarPdf(pdfEntry);
    const timestamp = Date.now();
    const fileName = `surat-pengantar-${submission.id}-signed-${timestamp}.pdf`;

    const { url } = await this.storageService.uploadFile(fileBuffer, fileName, 'letters');

    const letter = await this.submissionRepo.addGeneratedLetter({
      id: generateId(),
      submissionId,
      letterNumber,
      fileName,
      fileUrl: url,
      fileType: 'PDF',
      generatedByAdminId: verifiedByAdminId,
    });

    await this.submissionRepo.update(submissionId, {
      finalSignedFileUrl: url,
    });

    return letter;
  }

  private async buildSuratPengantarPdfEntry(
    submission: any,
    letterNumber: string,
    wakilDekanSignature: WakilDekanSignature,
    status: SuratPengantarPdfEntry['status'],
    sessionId: string = ''
  ): Promise<SuratPengantarPdfEntry> {
    const team = submission.team || await this.teamRepo.findById(submission.teamId);
    const teamMemberRows = await this.teamRepo.findMembersByTeamId(submission.teamId);

    const acceptedRows = teamMemberRows.filter((member) => member.invitationStatus === 'ACCEPTED');
    const effectiveRows = acceptedRows.length > 0 ? acceptedRows : teamMemberRows;

    const teamMembers: NonNullable<SuratPengantarPdfEntry['teamMembers']> = [];
    for (const member of effectiveRows) {
      const student = await this.resolveMahasiswa(member.mahasiswaId, sessionId);
      teamMembers.push({
        id: member.mahasiswaId,
        name: student?.name || member.mahasiswaId,
        nim: student?.nim,
        prodi: student?.prodi || submission.programStudi || '-',
        role: member.role || 'ANGGOTA',
      });
    }

    const leaderMember = teamMembers.find((member) => member.role === 'KETUA') || teamMembers[0];
    const tanggal = this.toIsoDate(submission.submittedAt || submission.createdAt || new Date());
    
    // Resolve supervisor: get dosen name (could be from team or need to resolve from ID)
    let supervisor = team?.dosenKpName || team?.academicSupervisor || undefined;
    
    // If supervisor looks like a UUID (with dashes), try to resolve it to get the name
    if (supervisor && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(supervisor)) {
      try {
        const dosenDetail = await this.dosenService.getDosenById(supervisor, sessionId);
        if (dosenDetail?.profile?.fullName) {
          supervisor = dosenDetail.profile.fullName;
        }
      } catch (err) {
        console.warn('[buildSuratPengantarPdfEntry] Could not resolve dosen UUID to name:', supervisor, err);
      }
    }

    const activeSignature = status === 'disetujui'
      ? await this.ssoSignatureProxyService.getActiveSignature(sessionId)
      : null;

    return {
      id: submission.id,
      tanggal,
      nim: leaderMember?.nim || submission.nim || '-',
      namaMahasiswa: leaderMember?.name || submission.namaMahasiswa || 'Mahasiswa',
      programStudi: leaderMember?.prodi || submission.programStudi || '-',
      status,
      supervisor: supervisor || '-',
      teamMembers,
      namaPerusahaan: submission.companyName || '-',
      tujuanSurat: submission.letterPurpose || '-',
      alamatPerusahaan: submission.companyAddress || '-',
      divisi: submission.division || '-',
      tanggalMulai: this.toIsoDateString(submission.startDate),
      tanggalSelesai: this.toIsoDateString(submission.endDate),
      nomorSurat: letterNumber,
      dosenNama: wakilDekanSignature?.name || '-',
      dosenNip: wakilDekanSignature?.nip || '-',
      dosenJabatan: wakilDekanSignature?.position || '-',
      dosenEsignatureUrl: status === 'disetujui' ? wakilDekanSignature?.esignatureUrl : undefined,
      dosenEsignatureSvg: activeSignature?.mimeType === 'image/svg+xml' ? activeSignature.svg : undefined,
    };
  }

  private async resolveMahasiswa(mahasiswaId: string, sessionId: string = ''): Promise<{ name: string; nim?: string; prodi?: string } | null> {
    try {
      const data = await this.mahasiswaService.getMahasiswaById(mahasiswaId, sessionId);
      const mahasiswa = data as unknown as Record<string, unknown> | null;
      const profile = (mahasiswa?.profile as Record<string, unknown> | undefined) || undefined;
      const prodi = mahasiswa?.prodi as Record<string, unknown> | undefined;
      return {
        name: (profile?.fullName as string | undefined) || mahasiswaId,
        nim: (mahasiswa?.nim as string | undefined) || undefined,
        prodi: (prodi?.nama as string | undefined) || undefined,
      };
    } catch (err) {
      console.warn('[resolveMahasiswa] Failed to fetch mahasiswa data:', mahasiswaId, err);
      return null;
    }
  }

  private async generateSuratPengantarPdf(entry: SuratPengantarPdfEntry): Promise<Buffer> {
    const pdf = new jsPDF('portrait', 'mm', 'a4');
    const left = 20;
    const right = 190;
    const state = { y: 20 };

    const ensureSpace = (requiredHeight: number) => {
      if (state.y + requiredHeight <= 275) return;
      pdf.addPage();
      state.y = 20;
    };

    const lineHeight115 = 4.5;

    const writeJustifiedParagraph = (
      text: string,
      x: number,
      width: number,
      lineHeight = lineHeight115,
    ) => {
      const lines = pdf.splitTextToSize(text, width) as string[];
      lines.forEach((line, index) => {
        const value = line.trim();
        const isLastLine = index === lines.length - 1;
        const words = value.split(/\s+/).filter(Boolean);

        if (!isLastLine && words.length > 1) {
          const wordsWidth = words.reduce((total, word) => total + pdf.getTextWidth(word), 0);
          const extraSpace = (width - wordsWidth) / (words.length - 1);
          let cursorX = x;
          words.forEach((word, wordIndex) => {
            pdf.text(word, cursorX, state.y);
            if (wordIndex < words.length - 1) {
              cursorX += pdf.getTextWidth(word) + extraSpace;
            }
          });
        } else {
          pdf.text(value, x, state.y);
        }

        state.y += lineHeight;
      });
    };

    const teamMembers =
      entry.teamMembers && entry.teamMembers.length > 0
        ? entry.teamMembers
        : [
            {
              id: `fallback-${entry.id}`,
              name: entry.namaMahasiswa || '-',
              nim: entry.nim || '-',
              prodi: entry.programStudi || '-',
              role: 'Ketua',
            },
          ];

    const tujuanSurat = this.sanitizeText(this.buildRecipientLine(entry));
    const alamatPerusahaan = entry.alamatPerusahaan || '-';
    const nomorSurat = entry.nomorSurat || '-';
    const tanggalSurat = this.formatDateLong(entry.approvedAt || entry.tanggal);

    const logoX = 12;
    const logoY = 14;
    const logoSize = 36;
    try {
      pdf.addImage(`data:image/png;base64,${UNSRI_LOGO_BASE64}`, 'PNG', logoX, logoY, logoSize, logoSize);
    } catch {
      this.drawLogoFallback(pdf, logoX, logoY, logoSize);
    }

    pdf.setFont('times', 'normal');
    pdf.setFontSize(16);
    pdf.text('KEMENTERIAN PENDIDIKAN TINGGI,', 105, state.y, { align: 'center' });
    state.y += 6;
    pdf.text('SAINS, DAN TEKNOLOGI', 105, state.y, { align: 'center' });
    state.y += 7;

    pdf.setFont('times', 'normal');
    pdf.setFontSize(14);
    pdf.text('UNIVERSITAS SRIWIJAYA', 105, state.y, { align: 'center' });
    state.y += 5;
    pdf.setFont('times', 'bold');
    pdf.text('FAKULTAS ILMU KOMPUTER', 105, state.y, { align: 'center' });
    state.y += 7;

    pdf.setFont('times', 'normal');
    pdf.setFontSize(11);
    pdf.text('Jalan Palembang - Prabumulih Km. 32 Inderalaya Ogan Ilir Kode Pos 30662', 105, state.y, { align: 'center' });
    state.y += 5;
    pdf.text('Telepon (+62711) 379249. Pos-el humas@ilkom.unsri.ac.id', 105, state.y, { align: 'center' });
    state.y += 5;
    pdf.setLineWidth(0.5);
    pdf.line(left, state.y, right, state.y);
    state.y += 10;

    const contentLeft = left + 10;
    const contentRight = right - 10;
    const contentWidth = contentRight - contentLeft;
    const metadataLeft = contentLeft;
    pdf.setFontSize(12);
    pdf.text('Nomor', metadataLeft, state.y);
    pdf.text(':', metadataLeft + 22, state.y);
    pdf.text(nomorSurat, metadataLeft + 26, state.y);
    pdf.text(tanggalSurat, contentRight, state.y, { align: 'right' });
    state.y += lineHeight115;

    pdf.text('Lampiran', metadataLeft, state.y);
    pdf.text(':', metadataLeft + 22, state.y);
    pdf.text('1 (satu) berkas', metadataLeft + 26, state.y);
    state.y += lineHeight115;

    pdf.text('Perihal', metadataLeft, state.y);
    pdf.text(':', metadataLeft + 22, state.y);
    pdf.setFont('times', 'normal');
    pdf.text('Izin Kerja Praktik', metadataLeft + 26, state.y);
    pdf.setFont('times', 'normal');
    state.y += lineHeight115 * 2;

    pdf.setFont('times', 'bold');
    const recipientLabelX = contentLeft;
    const recipientValueX = contentLeft + 20;
    const recipientWidth = contentWidth - (recipientValueX - contentLeft);

    pdf.text('Yth.', recipientLabelX, state.y);
    const tujuanLines = pdf.splitTextToSize(tujuanSurat, recipientWidth) as string[];
    pdf.text(tujuanLines, recipientValueX, state.y);
    state.y += Math.max(1, tujuanLines.length) * lineHeight115;

    const alamatLines = pdf.splitTextToSize(alamatPerusahaan, recipientWidth) as string[];
    pdf.text(alamatLines, recipientValueX, state.y);
    state.y += Math.max(1, alamatLines.length) * lineHeight115;
    
    pdf.setFont('times', 'normal');
    pdf.text('di', recipientValueX, state.y);
    state.y += lineHeight115;
    pdf.text('Tempat', recipientValueX + 12, state.y);
    state.y += lineHeight115 * 3;

    pdf.setFont('times', 'normal');
    const openingText = 'Dengan hormat, kami sampaikan bahwa salah satu syarat mahasiswa Fakultas Ilmu Komputer Universitas Sriwijaya untuk menyelesaikan pendidikannya adalah melakukan Kerja Praktik (KP). Kerja Praktik ini bertujuan untuk memberikan pengalaman kerja sesuai kompetensi atau program studi mahasiswa berkaitan Teknologi Informasi dan Komunikasi (TIK). Berkenaan hal tersebut, mahasiswa berikut ini :';
    writeJustifiedParagraph(openingText, contentLeft, contentWidth, lineHeight115);
    state.y += 3;

    const labelX = contentLeft + 18;
    const colonX = contentLeft + 63;
    const valueX = contentLeft + 67;
    const fieldValueWidth = contentRight - valueX - 2;

    teamMembers.forEach((member, index) => {
      ensureSpace(40);
      pdf.setFont('times', 'normal');
      pdf.text(`${index + 1}.`, contentLeft + 2, state.y);

      const writeField = (label: string, value: string) => {
        pdf.text(label, labelX, state.y);
        pdf.text(':', colonX, state.y);
        const lines = pdf.splitTextToSize(value || '-', fieldValueWidth) as string[];
        pdf.text(lines, valueX, state.y);
        state.y += Math.max(1, lines.length) * lineHeight115;
      };

      writeField('Nama', member.name || '-');
      writeField('NIM', member.nim || '-');
      writeField('Program Studi', member.prodi || entry.programStudi || '-');
      writeField('Dosen Pembimbing', entry.supervisor || '-');
      state.y += lineHeight115 * 0.65;
    });

    ensureSpace(65);

    const periodText = this.formatRangeDate(entry.tanggalMulai, entry.tanggalSelesai).replace(/\s+/g, ' ').trim();
    const penutupText = `Merencanakan Kerja Praktik (KP) di unit/bagian/subbagian ${entry.divisi || '-'} yang Bapak/Ibu pimpin pada tanggal ${periodText} dengan proposal KP terlampir. Mohon kiranya Bapak/Ibu dapat memperkenankan/memfasilitasi mahasiswa tersebut.`.replace(/\s+/g, ' ');

    const words = penutupText.split(' ');
    let line = '';
    let y = state.y;
    pdf.setFontSize(12);
    for (let i = 0; i < words.length; i++) {
      const testLine = line.length > 0 ? line + ' ' + words[i] : words[i];
      const testWidth = pdf.getTextWidth(testLine);
      if (testWidth > contentWidth && line.length > 0) {
        let x = contentLeft;
        let idx = 0;
        while (idx < line.length) {
          const periodIdx = line.indexOf(periodText, idx);
          if (periodIdx === -1) {
            pdf.setFont('times', 'normal');
            pdf.text(line.substring(idx), x, y);
            break;
          }
          if (periodIdx > idx) {
            pdf.setFont('times', 'normal');
            const before = line.substring(idx, periodIdx);
            pdf.text(before, x, y);
            x += pdf.getTextWidth(before);
          }
          pdf.setFont('times', 'bold');
          pdf.text(periodText, x, y);
          x += pdf.getTextWidth(periodText);
          idx = periodIdx + periodText.length;
        }
        y += lineHeight115;
        line = words[i];
      } else {
        line = testLine;
      }
    }
    if (line.length > 0) {
      let x = contentLeft;
      let idx = 0;
      while (idx < line.length) {
        const periodIdx = line.indexOf(periodText, idx);
        if (periodIdx === -1) {
          pdf.setFont('times', 'normal');
          pdf.text(line.substring(idx), x, y);
          break;
        }
        if (periodIdx > idx) {
          pdf.setFont('times', 'normal');
          const before = line.substring(idx, periodIdx);
          pdf.text(before, x, y);
          x += pdf.getTextWidth(before);
        }
        pdf.setFont('times', 'bold');
        pdf.text(periodText, x, y);
        x += pdf.getTextWidth(periodText);
        idx = periodIdx + periodText.length;
      }
      y += lineHeight115;
    }
    state.y = y + 3;

    writeJustifiedParagraph('Atas perkenan dan bantuannya, kami mengucapkan terima kasih.', contentLeft, contentWidth, lineHeight115);
    state.y += 8;

    const signX = contentRight - 53;
    pdf.setFont('times', 'normal');
    pdf.text('Wakil Dekan Bidang Akademik,', signX, state.y);
    const signatureTopY = state.y + (-10);
    state.y += 28;

    let hasRenderedSignature = false;
    if (entry.status === 'disetujui' && entry.dosenEsignatureSvg) {
      try {
        this.drawSignatureSvg(pdf, entry.dosenEsignatureSvg, signX - 38, signatureTopY, 125, 55);
        hasRenderedSignature = true;
      } catch (error) {
        console.warn('[generateSuratPengantarPdf] Failed to render SVG e-signature:', error);
        hasRenderedSignature = false;
      }
    }

    if (!hasRenderedSignature && entry.status === 'disetujui' && entry.dosenEsignatureUrl) {
      try {
        const signatureDataUrl = await this.toDataUrlFromImageUrl(entry.dosenEsignatureUrl);
        const format = this.getImageFormatFromDataUrl(signatureDataUrl);
        pdf.addImage(signatureDataUrl, format, signX - 8, signatureTopY, 55, 20);
        hasRenderedSignature = true;
      } catch (error) {
        console.warn('[generateSuratPengantarPdf] Failed to render image e-signature fallback:', error);
      }
    }

    if (!hasRenderedSignature) {
      pdf.setFont('times', 'italic');
      pdf.text('[Tanda Tangan Digital]', signX, signatureTopY + 13);
    }

    pdf.setFontSize(12);
    pdf.setFont('times', 'normal');
    pdf.text(entry.dosenNama || '-', signX, state.y);
    state.y += 7;
    pdf.text(`NIP ${entry.dosenNip || '-'}`, signX, state.y);

    const safeName = (entry.namaPerusahaan || entry.namaMahasiswa || 'surat')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = `surat-pengantar-${safeName || entry.id}.pdf`;

    pdf.save(filename);
    return Buffer.from(pdf.output('arraybuffer'));
  }

  private async generatePDF(submission: LetterSubmission, letterNumber: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(12).text('UNIVERSITAS [NAMA UNIVERSITAS]', { align: 'center' });
      doc.fontSize(10).text('Fakultas [Nama Fakultas]', { align: 'center' });
      doc.moveDown();

      doc.fontSize(10);
      doc.text(`Nomor: ${letterNumber}`, { align: 'left' });
      doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, { align: 'left' });
      doc.moveDown();

      doc.fontSize(14).text('SURAT PENGANTAR KERJA PRAKTIK', { align: 'center', underline: true });
      doc.moveDown(2);

      doc.fontSize(11);
      doc.text('Kepada Yth.');
      doc.text(`${submission.companyName}`);
      doc.text(`${submission.companyAddress}`);
      doc.moveDown();

      doc.text('Dengan hormat,');
      doc.moveDown();

      doc.text('Dengan ini kami mengajukan permohonan kepada Bapak/Ibu untuk dapat menerima mahasiswa kami untuk melaksanakan Kerja Praktik di perusahaan yang Bapak/Ibu pimpin.', { align: 'justify' });
      doc.moveDown();

      doc.text('Adapun data mahasiswa tersebut adalah:');
      doc.text(`Tim: ${submission.teamId}`);
      doc.text(`Posisi: ${submission.division || '-'}`);
      doc.text(`Periode: ${submission.startDate ? new Date(submission.startDate).toLocaleDateString('id-ID') : '-'} s/d ${submission.endDate ? new Date(submission.endDate).toLocaleDateString('id-ID') : '-'}`);
      doc.moveDown();

      doc.text('Demikian surat pengantar ini kami sampaikan, atas perhatian dan kerjasamanya kami ucapkan terima kasih.', { align: 'justify' });
      doc.moveDown(2);

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
            new Paragraph({ text: 'UNIVERSITAS [NAMA UNIVERSITAS]', alignment: 'center' }),
            new Paragraph({ text: 'Fakultas [Nama Fakultas]', alignment: 'center' }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun(`Nomor: ${letterNumber}`)] }),
            new Paragraph({ children: [new TextRun(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`)] }),
            new Paragraph({ text: '' }),
            new Paragraph({ children: [new TextRun({ text: 'SURAT PENGANTAR KERJA PRAKTIK', bold: true })], alignment: 'center' }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Kepada Yth.' }),
            new Paragraph({ text: submission.companyName ?? '' }),
            new Paragraph({ text: submission.companyAddress ?? '' }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Dengan hormat,' }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Dengan ini kami mengajukan permohonan kepada Bapak/Ibu untuk dapat menerima mahasiswa kami untuk melaksanakan Kerja Praktik di perusahaan yang Bapak/Ibu pimpin.' }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Adapun data mahasiswa tersebut adalah:' }),
            new Paragraph({ text: `Tim: ${submission.teamId}` }),
            new Paragraph({ text: `Posisi: ${submission.division || '-'}` }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: 'Demikian surat pengantar ini kami sampaikan, atas perhatian dan kerjasamanya kami ucapkan terima kasih.' }),
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
    const randomNum = Math.floor(Math.random() * 9000) + 1000;
    return `${randomNum}/KP/FT/${month}/${year}`;
  }

  async getLetterBySubmissionId(submissionId: string) {
    return await this.submissionRepo.findLettersBySubmissionId(submissionId);
  }

  private getImageFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' {
    return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  }

  private extractSvgViewBox(svgText: string): { width: number; height: number } {
    const viewBoxMatch = svgText.match(/viewBox\s*=\s*"([^"]+)"/i);
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map((value) => Number(value));
      if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
        return { width: parts[2], height: parts[3] };
      }
    }

    const widthMatch = svgText.match(/width\s*=\s*"([^"]+)"/i);
    const heightMatch = svgText.match(/height\s*=\s*"([^"]+)"/i);
    const width = widthMatch ? Number.parseFloat(widthMatch[1]) : NaN;
    const height = heightMatch ? Number.parseFloat(heightMatch[1]) : NaN;

    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }

    return { width: 200, height: 80 };
  }

  private extractSvgPathData(svgText: string): Array<{ d: string; strokeWidth: number }> {
    const paths: Array<{ d: string; strokeWidth: number }> = [];
    const pathRegex = /<path\b[^>]*\bd=(["'])(.*?)\1[^>]*>/gis;
    let match: RegExpExecArray | null;

    while ((match = pathRegex.exec(svgText)) !== null) {
      const element = match[0];
      const strokeWidthMatch = element.match(/stroke-width\s*=\s*(["'])([^"']+)\1/i);
      const strokeWidth = strokeWidthMatch ? Number.parseFloat(strokeWidthMatch[2]) : 2.5;

      if (match[2].trim().length > 0) {
        paths.push({
          d: match[2],
          strokeWidth: Number.isFinite(strokeWidth) && strokeWidth > 0 ? strokeWidth : 2.5,
        });
      }
    }

    return paths;
  }

  private parseSvgPathToJsPdfOps(
    pathData: string,
    scale: number,
    offsetX: number,
    offsetY: number
  ): Array<{ op: 'm' | 'l' | 'c' | 'h'; c: number[] }> {
    const tokens = pathData.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g) || [];
    const ops: Array<{ op: 'm' | 'l' | 'c' | 'h'; c: number[] }> = [];

    let index = 0;
    let command = '';
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;
    let lastCubicControlX = 0;
    let lastCubicControlY = 0;
    let lastQuadraticControlX = 0;
    let lastQuadraticControlY = 0;
    let previousCommand = '';

    const nextNumber = () => Number(tokens[index++]);
    const hasMoreNumbers = () => index < tokens.length && !/^[a-zA-Z]$/.test(tokens[index]);
    const transform = (x: number, y: number): [number, number] => [offsetX + x * scale, offsetY + y * scale];

    while (index < tokens.length) {
      const token = tokens[index];
      if (/^[a-zA-Z]$/.test(token)) {
        command = token;
        index += 1;
      } else if (!command) {
        break;
      }

      const isRelative = command === command.toLowerCase();
      const upper = command.toUpperCase();

      if (upper === 'M') {
        const x = nextNumber();
        const y = nextNumber();
        const absX = isRelative ? currentX + x : x;
        const absY = isRelative ? currentY + y : y;
        const [tx, ty] = transform(absX, absY);
        ops.push({ op: 'm', c: [tx, ty] });
        currentX = absX;
        currentY = absY;
        startX = absX;
        startY = absY;
        previousCommand = 'M';

        while (hasMoreNumbers()) {
          const lx = nextNumber();
          const ly = nextNumber();
          const lineX = isRelative ? currentX + lx : lx;
          const lineY = isRelative ? currentY + ly : ly;
          const [txLine, tyLine] = transform(lineX, lineY);
          ops.push({ op: 'l', c: [txLine, tyLine] });
          currentX = lineX;
          currentY = lineY;
          previousCommand = 'L';
        }
        continue;
      }

      if (upper === 'L') {
        while (hasMoreNumbers()) {
          const x = nextNumber();
          const y = nextNumber();
          const absX = isRelative ? currentX + x : x;
          const absY = isRelative ? currentY + y : y;
          const [tx, ty] = transform(absX, absY);
          ops.push({ op: 'l', c: [tx, ty] });
          currentX = absX;
          currentY = absY;
        }
        previousCommand = 'L';
        continue;
      }

      if (upper === 'H') {
        while (hasMoreNumbers()) {
          const x = nextNumber();
          currentX = isRelative ? currentX + x : x;
          const [tx, ty] = transform(currentX, currentY);
          ops.push({ op: 'l', c: [tx, ty] });
        }
        previousCommand = 'H';
        continue;
      }

      if (upper === 'V') {
        while (hasMoreNumbers()) {
          const y = nextNumber();
          currentY = isRelative ? currentY + y : y;
          const [tx, ty] = transform(currentX, currentY);
          ops.push({ op: 'l', c: [tx, ty] });
        }
        previousCommand = 'V';
        continue;
      }

      if (upper === 'C') {
        while (hasMoreNumbers()) {
          const x1 = nextNumber();
          const y1 = nextNumber();
          const x2 = nextNumber();
          const y2 = nextNumber();
          const x = nextNumber();
          const y = nextNumber();
          const c1x = isRelative ? currentX + x1 : x1;
          const c1y = isRelative ? currentY + y1 : y1;
          const c2x = isRelative ? currentX + x2 : x2;
          const c2y = isRelative ? currentY + y2 : y2;
          const endX = isRelative ? currentX + x : x;
          const endY = isRelative ? currentY + y : y;
          const [tc1x, tc1y] = transform(c1x, c1y);
          const [tc2x, tc2y] = transform(c2x, c2y);
          const [tx, ty] = transform(endX, endY);
          ops.push({ op: 'c', c: [tc1x, tc1y, tc2x, tc2y, tx, ty] });
          currentX = endX;
          currentY = endY;
          lastCubicControlX = c2x;
          lastCubicControlY = c2y;
          previousCommand = 'C';
        }
        continue;
      }

      if (upper === 'S') {
        while (hasMoreNumbers()) {
          const x2 = nextNumber();
          const y2 = nextNumber();
          const x = nextNumber();
          const y = nextNumber();
          const reflectedX = previousCommand === 'C' || previousCommand === 'S'
            ? (currentX * 2) - lastCubicControlX
            : currentX;
          const reflectedY = previousCommand === 'C' || previousCommand === 'S'
            ? (currentY * 2) - lastCubicControlY
            : currentY;
          const c2x = isRelative ? currentX + x2 : x2;
          const c2y = isRelative ? currentY + y2 : y2;
          const endX = isRelative ? currentX + x : x;
          const endY = isRelative ? currentY + y : y;
          const [trX, trY] = transform(reflectedX, reflectedY);
          const [tc2x, tc2y] = transform(c2x, c2y);
          const [tx, ty] = transform(endX, endY);
          ops.push({ op: 'c', c: [trX, trY, tc2x, tc2y, tx, ty] });
          currentX = endX;
          currentY = endY;
          lastCubicControlX = c2x;
          lastCubicControlY = c2y;
          previousCommand = 'S';
        }
        continue;
      }

      if (upper === 'Q') {
        while (hasMoreNumbers()) {
          const qx = nextNumber();
          const qy = nextNumber();
          const x = nextNumber();
          const y = nextNumber();
          const controlX = isRelative ? currentX + qx : qx;
          const controlY = isRelative ? currentY + qy : qy;
          const endX = isRelative ? currentX + x : x;
          const endY = isRelative ? currentY + y : y;
          const c1x = currentX + ((controlX - currentX) * 2) / 3;
          const c1y = currentY + ((controlY - currentY) * 2) / 3;
          const c2x = endX + ((controlX - endX) * 2) / 3;
          const c2y = endY + ((controlY - endY) * 2) / 3;
          const [tc1x, tc1y] = transform(c1x, c1y);
          const [tc2x, tc2y] = transform(c2x, c2y);
          const [tx, ty] = transform(endX, endY);
          ops.push({ op: 'c', c: [tc1x, tc1y, tc2x, tc2y, tx, ty] });
          currentX = endX;
          currentY = endY;
          lastQuadraticControlX = controlX;
          lastQuadraticControlY = controlY;
          previousCommand = 'Q';
        }
        continue;
      }

      if (upper === 'T') {
        while (hasMoreNumbers()) {
          const x = nextNumber();
          const y = nextNumber();
          const controlX = previousCommand === 'Q' || previousCommand === 'T'
            ? (currentX * 2) - lastQuadraticControlX
            : currentX;
          const controlY = previousCommand === 'Q' || previousCommand === 'T'
            ? (currentY * 2) - lastQuadraticControlY
            : currentY;
          const endX = isRelative ? currentX + x : x;
          const endY = isRelative ? currentY + y : y;
          const c1x = currentX + ((controlX - currentX) * 2) / 3;
          const c1y = currentY + ((controlY - currentY) * 2) / 3;
          const c2x = endX + ((controlX - endX) * 2) / 3;
          const c2y = endY + ((controlY - endY) * 2) / 3;
          const [tc1x, tc1y] = transform(c1x, c1y);
          const [tc2x, tc2y] = transform(c2x, c2y);
          const [tx, ty] = transform(endX, endY);
          ops.push({ op: 'c', c: [tc1x, tc1y, tc2x, tc2y, tx, ty] });
          currentX = endX;
          currentY = endY;
          lastQuadraticControlX = controlX;
          lastQuadraticControlY = controlY;
          previousCommand = 'T';
        }
        continue;
      }

      if (upper === 'A') {
        while (hasMoreNumbers()) {
          nextNumber();
          nextNumber();
          nextNumber();
          nextNumber();
          nextNumber();
          const x = nextNumber();
          const y = nextNumber();
          const endX = isRelative ? currentX + x : x;
          const endY = isRelative ? currentY + y : y;
          const [tx, ty] = transform(endX, endY);
          ops.push({ op: 'l', c: [tx, ty] });
          currentX = endX;
          currentY = endY;
          previousCommand = 'A';
        }
        continue;
      }

      if (upper === 'Z') {
        const [tx, ty] = transform(startX, startY);
        ops.push({ op: 'h', c: [tx, ty] });
        currentX = startX;
        currentY = startY;
        previousCommand = 'Z';
        continue;
      }

      throw new Error(`Unsupported SVG path command: ${command}`);
    }

    return ops;
  }

  private drawSignatureSvg(pdf: jsPDF, svgText: string, x: number, y: number, width: number, height: number) {
    const paths = this.extractSvgPathData(svgText);
    if (paths.length === 0) {
      throw new Error('File e-signature SVG tidak memiliki path yang bisa dirender.');
    }

    const box = this.extractSvgViewBox(svgText);
    const paddingX = Math.max(width * 0.08, 4);
    const paddingY = Math.max(height * 0.08, 4);
    const innerWidth = Math.max(width - paddingX * 2, 1);
    const innerHeight = Math.max(height - paddingY * 2, 1);
    const scale = Math.min(innerWidth / box.width, innerHeight / box.height);
    const scaledWidth = box.width * scale;
    const scaledHeight = box.height * scale;
    const offsetX = x + paddingX + (innerWidth - scaledWidth) / 2;
    const offsetY = y + paddingY + (innerHeight - scaledHeight) / 2;

    for (const pathData of paths) {
      const ops = this.parseSvgPathToJsPdfOps(pathData.d, scale, offsetX, offsetY);
      pdf.setLineWidth(Math.max(pathData.strokeWidth * scale * 1.3, 0.4));
      pdf.path(ops);
      pdf.stroke();
    }
  }

  private async toDataUrlFromImageUrl(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error('Gagal memuat gambar tanda tangan');
    }

    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const bytes = await response.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
      return `data:image/jpeg;base64,${base64}`;
    }
    return `data:image/png;base64,${base64}`;
  }

  private formatDateLong(dateStr?: string): string {
    if (!dateStr) return '-';
    const bulan = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];

    const normalized = dateStr.trim();
    let d: Date;
    const localDateMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (localDateMatch) {
      const [, dd, mm, yyyy] = localDateMatch;
      d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    } else {
      d = new Date(normalized);
    }

    if (Number.isNaN(d.getTime())) return dateStr;
    return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
  }

  private formatRangeDate(startDate?: string, endDate?: string): string {
    const start = this.formatDateLong(startDate).replace(/\s+/g, ' ').trim();
    const end = this.formatDateLong(endDate).replace(/\s+/g, ' ').trim();
    if (start === end) return start;
    return `${start} - ${end}`;
  }

  private sanitizeText(value?: string): string {
    if (!value) return '';
    return value.replace(/\s+/g, ' ').trim();
  }

  private buildRecipientLine(entry: SuratPengantarPdfEntry): string {
    const tujuan = this.sanitizeText(entry.tujuanSurat);
    const company = this.sanitizeText(entry.namaPerusahaan);
    if (tujuan && company) {
      if (tujuan.toLowerCase().includes(company.toLowerCase())) return tujuan;
      return `${tujuan} ${company}`;
    }
    return tujuan || company || '-';
  }

  private drawLogoFallback(pdf: jsPDF, x: number, y: number, size: number): void {
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    pdf.setDrawColor(30, 58, 138);
    pdf.setLineWidth(0.6);
    pdf.circle(centerX, centerY, size / 2, 'S');
    pdf.setFillColor(255, 255, 255);
    pdf.circle(centerX, centerY, size / 2 - 1.6, 'F');
    pdf.setFont('times', 'bold');
    pdf.setFontSize(7);
    pdf.text('UNSRI', centerX, centerY + 1.8, { align: 'center' });
  }

  private toIsoDate(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return new Date().toISOString();
    return date.toISOString();
  }

  private toIsoDateString(value?: string | Date | null): string | undefined {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : undefined;
    return date.toISOString();
  }
}
