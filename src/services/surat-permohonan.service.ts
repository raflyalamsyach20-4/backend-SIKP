import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { SuratPermohonanRepository } from '@/repositories/surat-permohonan.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { UserRepository } from '@/repositories/user.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { StorageService } from '@/services/storage.service';
import { generateId } from '@/utils/helpers';
import type { RbacRole } from '@/types';
import { createDbClient } from '@/db';

const ALLOWED_SIGNATURE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

type BulkApproveFailure = {
  requestId: string;
  reason: string;
};

type DosenSigningContext = {
  dosenNama: string;
  dosenNip: string | null;
  dosenJabatan: string | null;
  signatureImageBuffer: Buffer;
  signatureMimeType: string;
};

type MahasiswaSigningContext = {
  mahasiswaNama: string;
  mahasiswaNim: string | null;
  signatureImageBuffer: Buffer;
  signatureMimeType: string;
  signatureSourceUrl: string;
};

export class SuratPermohonanService {
  private suratPermohonanRepo: SuratPermohonanRepository;
  private teamRepo: TeamRepository;
  private userRepo: UserRepository;
  private submissionRepo: SubmissionRepository;
  private storageService: StorageService;

  constructor(
    private env: CloudflareBindings
  ) {
    const db = createDbClient(env.DATABASE_URL);
    this.suratPermohonanRepo = new SuratPermohonanRepository(db);
    this.teamRepo = new TeamRepository(db);
    this.userRepo = new UserRepository(db);
    this.submissionRepo = new SubmissionRepository(db);
    this.storageService = new StorageService(env);
  }

  /**
   * Mahasiswa mengajukan surat permohonan KP.
   */
  async requestSuratPermohonan(memberUserId: string, authUserId: string) {
    const memberUser = await this.userRepo.findById(memberUserId);
    if (!memberUser || memberUser.role !== 'MAHASISWA') {
      const error: Error = new Error('Pengguna tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    const fixedTeam = await this.resolveFixedTeamForRequest(memberUserId, authUserId);
    const submission = await this.resolveSubmissionByTeamId(fixedTeam.id);

    if (!submission.companyName || !submission.startDate || !submission.endDate) {
      const error: Error = new Error('Data perusahaan belum lengkap. Isi terlebih dahulu nama perusahaan, tanggal mulai, dan tanggal selesai KP.');
      error.statusCode = 422;
      throw error;
    }

    const dosenUserId = fixedTeam.dosenKpId || null;
    if (!dosenUserId) {
      const error: Error = new Error('Dosen KP tim belum ditetapkan. Silakan hubungi admin.');
      error.statusCode = 422;
      throw error;
    }

    const dosenUser = await this.userRepo.findById(dosenUserId);
    if (!dosenUser || dosenUser.role !== 'DOSEN' || !dosenUser.isActive) {
      const error: Error = new Error('Dosen tidak valid.');
      error.statusCode = 400;
      throw error;
    }

    const existing = await this.suratPermohonanRepo.findExistingPending(memberUserId, dosenUserId);
    if (existing) {
      const error: Error = new Error('Pengajuan surat permohonan untuk mahasiswa ini sudah dalam proses.');
      error.statusCode = 409;
      throw error;
    }

    const mahasiswaEsignatureUrl = await this.resolveMahasiswaEsignatureUrl(memberUserId);

    const requestId = generateId();
    await this.suratPermohonanRepo.create({
      id: requestId,
      memberMahasiswaId: memberUserId,
      dosenId: dosenUserId,
      submissionId: submission.id,
      status: 'MENUNGGU',
      mahasiswaEsignatureUrl,
      mahasiswaEsignatureSnapshotAt: new Date(),
    });

    return { requestId };
  }

  /**
   * Dosen melihat list ajuan surat permohonan.
   */
  async getRequestsForDosen(dosenUserId: string, role: RbacRole) {
    const requests =
      role === 'wakil_dekan'
        ? await this.suratPermohonanRepo.findAllWithDetails()
        : await this.suratPermohonanRepo.findByDosenIdWithDetails(dosenUserId);

    return requests.map((req) => {
      const proxiedMahasiswaEsignatureUrl = this.storageService.getEsignatureAssetProxyUrlFromPublicUrl(req.mahasiswaEsignatureUrl);

      return {
        id: req.id,
        tanggal: this.formatDateOnly(req.tanggal),
        nim: req.nim,
        namaMahasiswa: req.namaMahasiswa,
        programStudi: req.programStudi,
        angkatan: req.angkatan,
        semester: req.semester != null ? String(req.semester) : null,
        jumlahSks: req.jumlahSks != null ? String(req.jumlahSks) : null,
        tahunAjaran: this.getAcademicYear(req.tanggal),
        email: req.email,
        noHp: req.noHp,
        jenisSurat: req.jenisSurat,
        status: req.status,
        mahasiswaEsignatureUrl: proxiedMahasiswaEsignatureUrl,
        mahasiswa_esignature_url: proxiedMahasiswaEsignatureUrl,
        mahasiswaEsignatureSnapshotAt: req.mahasiswaEsignatureSnapshotAt,
        dosenNama: req.dosenNama || '-',
        dosenNip: req.dosenNip,
        dosenJabatan: req.dosenJabatan,
        dosenEsignatureUrl: req.dosenEsignatureUrl,
        signedFileUrl: req.signedFileUrl,
        approvedAt: req.approvedAt,
        rejectedAt: req.status === 'DITOLAK' ? req.rejectedAt : null,
        rejectionReason: req.status === 'DITOLAK' ? (req.rejectionReason ?? null) : null,
        namaPerusahaan: req.namaPerusahaan,
        alamatPerusahaan: req.alamatPerusahaan,
        teleponPerusahaan: req.teleponPerusahaan,
        jenisProdukUsaha: req.jenisProdukUsaha,
        divisi: req.divisi,
        tanggalMulai: req.tanggalMulai,
        tanggalSelesai: req.tanggalSelesai,
      };
    });
  }

  async approveSingleRequest(requestId: string, dosenUserId: string) {
    const dosenSigningContext = await this.getDosenSigningContext(dosenUserId);
    return await this.approveAndSignRequest(requestId, dosenUserId, dosenSigningContext);
  }

  async approveBulkRequests(requestIds: string[], dosenUserId: string) {
    const failed: BulkApproveFailure[] = [];
    let approvedCount = 0;

    let dosenSigningContext: DosenSigningContext;
    try {
      dosenSigningContext = await this.getDosenSigningContext(dosenUserId);
    } catch (error: unknown) {
      const reason = error instanceof Error && error.message
        ? error.message
        : 'Gagal memuat e-signature dosen.';
      return {
        approvedCount,
        failed: requestIds.map((requestId) => ({ requestId, reason })),
      };
    }

    for (const requestId of requestIds) {
      try {
        await this.approveAndSignRequest(requestId, dosenUserId, dosenSigningContext);
        approvedCount += 1;
      } catch (error: unknown) {
        failed.push({
          requestId,
          reason: error instanceof Error && error.message
            ? error.message
            : 'Gagal menyetujui pengajuan.',
        });
      }
    }

    return {
      approvedCount,
      failed,
    };
  }

  async rejectRequest(requestId: string, dosenUserId: string, reason: string) {
    const request = await this.suratPermohonanRepo.findById(requestId);
    if (!request) {
      const error: Error = new Error('Pengajuan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (request.dosenId !== dosenUserId) {
      const error: Error = new Error('Anda tidak berhak mengubah pengajuan ini.');
      error.statusCode = 403;
      throw error;
    }

    if (request.status !== 'MENUNGGU') {
      const error: Error = new Error('Pengajuan sudah diproses.');
      error.statusCode = 409;
      throw error;
    }

    const updated = await this.suratPermohonanRepo.rejectPending(requestId, dosenUserId, reason.trim());
    if (!updated) {
      const error: Error = new Error('Pengajuan sudah diproses.');
      error.statusCode = 409;
      throw error;
    }

    return {
      requestId: updated.id,
      status: 'DITOLAK' as const,
      rejectionReason: updated.rejectionReason ?? null,
      rejectedAt: updated.approvedAt,
    };
  }

  /**
   * Mahasiswa ajukan ulang request surat permohonan yang ditolak.
   * Requirement: update existing row, bukan create row baru.
   */
  async reapplyRequest(requestId: string, memberUserId: string, authUserId: string) {
    if (memberUserId !== authUserId) {
      const error: Error = new Error('Anda tidak memiliki akses untuk request ini.');
      error.statusCode = 403;
      throw error;
    }

    const request = await this.suratPermohonanRepo.findById(requestId);
    if (!request) {
      const error: Error = new Error('Request tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (request.memberMahasiswaId !== memberUserId) {
      const error: Error = new Error('Anda tidak memiliki akses untuk request ini.');
      error.statusCode = 403;
      throw error;
    }

    const normalizedStatus = String(request.status || '').toUpperCase();
    if (normalizedStatus !== 'DITOLAK' && normalizedStatus !== 'REJECTED') {
      const error: Error = new Error('Ajuan ulang hanya diperbolehkan untuk request yang ditolak.');
      error.statusCode = 409;
      throw error;
    }

    const mahasiswaEsignatureUrl = await this.resolveMahasiswaEsignatureUrl(memberUserId);

    const updated = await this.suratPermohonanRepo.reapplyRejected(requestId, memberUserId, {
      mahasiswaEsignatureUrl,
      mahasiswaEsignatureSnapshotAt: new Date(),
    });
    if (!updated) {
      const error: Error = new Error('Ajuan ulang hanya diperbolehkan untuk request yang ditolak.');
      error.statusCode = 409;
      throw error;
    }

    return {
      requestId: updated.id,
      status: updated.status,
    };
  }

  private async approveAndSignRequest(
    requestId: string,
    dosenUserId: string,
    dosenSigningContext: DosenSigningContext
  ) {
    const request = await this.suratPermohonanRepo.findById(requestId);
    if (!request) {
      const error: Error = new Error('Pengajuan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (request.dosenId !== dosenUserId) {
      const error: Error = new Error('Anda tidak berhak mengubah pengajuan ini.');
      error.statusCode = 403;
      throw error;
    }

    if (request.status !== 'MENUNGGU') {
      const error: Error = new Error('Pengajuan sudah diproses.');
      error.statusCode = 409;
      throw error;
    }

    const requestDetails = await this.suratPermohonanRepo.findByIdWithDetails(requestId);
    if (!requestDetails) {
      const error: Error = new Error('Detail pengajuan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    const startDate = this.toDate(requestDetails.startDate);
    const endDate = this.toDate(requestDetails.endDate);

    if (!requestDetails.companyName || !startDate || !endDate) {
      const error: Error = new Error('Data submission tidak lengkap untuk generate surat permohonan.');
      error.statusCode = 422;
      throw error;
    }

    const mahasiswaSigningContext = await this.getMahasiswaSigningContext(requestDetails);

    const signedPdfBuffer = await this.generateSignedPdf(
      requestDetails,
      dosenSigningContext,
      mahasiswaSigningContext
    );
    const signedFileName = `surat-permohonan-signed-${requestId}.pdf`;

    const { url: signedFileUrl, key: signedFileKey } = await this.storageService.uploadFile(
      signedPdfBuffer,
      signedFileName,
      'surat-permohonan/signed',
      'application/pdf'
    );

    if (!signedFileUrl || !signedFileKey) {
      const error: Error = new Error('Upload signed PDF gagal.');
      error.statusCode = 500;
      throw error;
    }

    const approvedAt = new Date();
    const updatedRequest = await this.suratPermohonanRepo.approveWithSignedFile(requestId, dosenUserId, {
      approvedByDosenId: dosenUserId,
      approvedAt,
      signedFileUrl,
      signedFileKey,
    });

    if (!updatedRequest) {
      try {
        await this.storageService.deleteFile(signedFileKey);
      } catch {
        // no-op best effort cleanup
      }

      const error: Error = new Error('Pengajuan sudah diproses.');
      error.statusCode = 409;
      throw error;
    }

    if (!updatedRequest.signedFileUrl || !updatedRequest.signedFileKey) {
      try {
        await this.storageService.deleteFile(signedFileKey);
      } catch {
        // no-op best effort cleanup
      }

      const error: Error = new Error('Gagal menyimpan metadata file signed ke database.');
      error.statusCode = 500;
      throw error;
    }

    return {
      requestId,
      status: 'DISETUJUI' as const,
      approvedAt,
      signedFileUrl,
    };
  }

  private async resolveFixedTeamForRequest(memberUserId: string, authUserId: string) {
    const memberTeams = (await this.teamRepo.findTeamsByMahasiswaId(memberUserId)).filter((team) => team.status === 'FIXED');

    if (memberTeams.length === 0) {
      const error: Error = new Error('Mahasiswa belum menetapkan tim.');
      error.statusCode = 422;
      throw error;
    }

    if (memberUserId === authUserId) {
      return memberTeams[0];
    }

    const authTeamIds = new Set(
      (await this.teamRepo.findTeamsByMahasiswaId(authUserId))
        .filter((team) => team.status === 'FIXED')
        .map((team) => team.id)
    );

    const sharedTeam = memberTeams.find((team) => authTeamIds.has(team.id));
    if (!sharedTeam) {
      const error: Error = new Error('Anda hanya dapat mengajukan untuk diri sendiri atau anggota tim FIXED yang valid.');
      error.statusCode = 403;
      throw error;
    }

    return sharedTeam;
  }

  private async resolveSubmissionByTeamId(teamId: string) {
    const teamSubmissions = await this.submissionRepo.findByTeamId(teamId);
    const submission = teamSubmissions[0];

    if (!submission) {
      const error: Error = new Error('Submission tim belum tersedia.');
      error.statusCode = 422;
      throw error;
    }

    return submission;
  }

  private async resolveMahasiswaEsignatureUrl(memberUserId: string): Promise<string> {
    const mahasiswaProfile = await this.userRepo.getMahasiswaMe(memberUserId);
    if (!mahasiswaProfile) {
      const error: Error = new Error('Profil mahasiswa tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (!mahasiswaProfile.esignatureUrl) {
      const error: Error = new Error('Mahasiswa belum memiliki tanda tangan digital. Silakan upload terlebih dahulu di halaman profil.');
      error.statusCode = 422;
      throw error;
    }

    return mahasiswaProfile.esignatureUrl;
  }

  private async resolveMahasiswaEsignatureUrlForApproval(
    requestDetails: Awaited<ReturnType<SuratPermohonanRepository['findByIdWithDetails']>>
  ): Promise<string> {
    if (!requestDetails) {
      const error: Error = new Error('Detail pengajuan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (requestDetails.mahasiswaEsignatureUrl) {
      return requestDetails.mahasiswaEsignatureUrl;
    }

    return await this.resolveMahasiswaEsignatureUrl(requestDetails.memberMahasiswaId);
  }

  private async getMahasiswaSigningContext(
    requestDetails: Awaited<ReturnType<SuratPermohonanRepository['findByIdWithDetails']>>
  ): Promise<MahasiswaSigningContext> {
    if (!requestDetails) {
      const error: Error = new Error('Detail pengajuan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    const mahasiswaEsignatureUrl = await this.resolveMahasiswaEsignatureUrlForApproval(requestDetails);
    const { imageBuffer, mimeType } = await this.downloadAndValidateSignatureImage(
      mahasiswaEsignatureUrl,
      'mahasiswa'
    );

    return {
      mahasiswaNama: requestDetails.mahasiswaNama || '-',
      mahasiswaNim: requestDetails.mahasiswaNim || null,
      signatureImageBuffer: imageBuffer,
      signatureMimeType: mimeType,
      signatureSourceUrl: mahasiswaEsignatureUrl,
    };
  }

  private async getDosenSigningContext(dosenUserId: string): Promise<DosenSigningContext> {
    const dosenProfile = await this.userRepo.getDosenMe(dosenUserId);
    if (!dosenProfile) {
      const error: Error = new Error('Profil dosen tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (!dosenProfile.esignatureUrl) {
      const error: Error = new Error('E-signature dosen belum tersedia. Silakan lengkapi di halaman profil.');
      error.statusCode = 422;
      throw error;
    }

    const { imageBuffer, mimeType } = await this.downloadAndValidateSignatureImage(
      dosenProfile.esignatureUrl,
      'dosen'
    );

    return {
      dosenNama: dosenProfile.nama || '-',
      dosenNip: dosenProfile.nip || null,
      dosenJabatan: dosenProfile.jabatan || null,
      signatureImageBuffer: imageBuffer,
      signatureMimeType: mimeType,
    };
  }

  private async downloadAndValidateSignatureImage(
    esignatureUrl: string,
    ownerLabel: 'dosen' | 'mahasiswa'
  ) {
    let response: Response;
    try {
      response = await fetch(esignatureUrl);
    } catch {
      const error: Error = new Error(`Gagal mengakses file e-signature ${ownerLabel}.`);
      error.statusCode = 422;
      throw error;
    }

    if (!response.ok) {
      const error: Error = new Error(`File e-signature ${ownerLabel} tidak dapat diakses.`);
      error.statusCode = 422;
      throw error;
    }

    const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_SIGNATURE_MIME_TYPES.includes(mimeType)) {
      const error: Error = new Error(`Format file e-signature ${ownerLabel} tidak valid. Gunakan PNG/JPG/JPEG.`);
      error.statusCode = 422;
      throw error;
    }

    const imageArrayBuffer = await response.arrayBuffer();
    if (imageArrayBuffer.byteLength === 0) {
      const error: Error = new Error(`File e-signature ${ownerLabel} kosong atau rusak.`);
      error.statusCode = 422;
      throw error;
    }

    return {
      imageBuffer: Buffer.from(imageArrayBuffer),
      mimeType,
    };
  }

  private async generateSignedPdf(
    requestDetails: Awaited<ReturnType<SuratPermohonanRepository['findByIdWithDetails']>>,
    dosenSigningContext: DosenSigningContext,
    mahasiswaSigningContext: MahasiswaSigningContext
  ): Promise<Buffer> {
    if (!requestDetails) {
      throw new Error('Detail pengajuan tidak ditemukan untuk pembuatan PDF.');
    }

    const startDate = this.toDate(requestDetails.startDate) || new Date();
    const endDate = this.toDate(requestDetails.endDate) || new Date();
    const lamaKp = this.calculateDurationInMonths(startDate, endDate);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

    const marginX = 62;
    const colonX = 205;
    const valueX = 220;
    const titleSize = 14;
    const bodySize = 10.8;
    const pageWidth = page.getWidth();

    let y = 790;

    const drawLine = (
      text: string,
      options?: { x?: number; size?: number; bold?: boolean; italic?: boolean; lineGap?: number }
    ) => {
      const x = options?.x ?? marginX;
      const size = options?.size ?? bodySize;
      let activeFont = font;
      if (options?.bold) activeFont = fontBold;
      if (options?.italic) activeFont = fontItalic;

      page.drawText(text, {
        x,
        y,
        size,
        font: activeFont,
        color: rgb(0, 0, 0),
      });

      y -= options?.lineGap ?? 16;
    };

    const wrapText = (
      text: string,
      maxWidth: number,
      activeFont: typeof font,
      size: number
    ) => {
      const words = text.split(' ');
      const lines: string[] = [];
      let line = '';

      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const width = activeFont.widthOfTextAtSize(testLine, size);
        if (width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = testLine;
        }
      }

      if (line) {
        lines.push(line);
      }

      return lines;
    };

    const drawParagraph = (
      text: string,
      maxWidth: number = 500,
      lineGap: number = 14,
      startX: number = marginX,
      activeFont: typeof font = font
    ) => {
      const lines = wrapText(text, maxWidth, activeFont, bodySize);
      for (const line of lines) {
        page.drawText(line, { x: startX, y, size: bodySize, font: activeFont, color: rgb(0, 0, 0) });
        y -= lineGap;
      }
    };

    const drawNumberedItem = (numberLabel: string, text: string) => {
      const numberX = marginX + 12;
      const textX = marginX + 42;
      const maxWidth = pageWidth - textX - 42;
      const itemTopY = y;
      const wrappedLines = wrapText(text, maxWidth, font, bodySize);

      page.drawText(numberLabel, {
        x: numberX,
        y: itemTopY,
        size: bodySize,
        font,
        color: rgb(0, 0, 0),
      });

      for (const line of wrappedLines) {
        page.drawText(line, {
          x: textX,
          y,
          size: bodySize,
          font,
          color: rgb(0, 0, 0),
        });
        y -= 12;
      }

      y -= 4;
    };

    const drawLabelValue = (
      label: string,
      value: string,
      lineGap: number = 15,
      offsets?: { colonX?: number; valueX?: number }
    ) => {
      const safeValue = value && value.trim() ? value : '-';
      const activeColonX = offsets?.colonX ?? colonX;
      const activeValueX = offsets?.valueX ?? valueX;
      page.drawText(label, {
        x: marginX,
        y,
        size: bodySize,
        font,
        color: rgb(0, 0, 0),
      });
      page.drawText(':', {
        x: activeColonX,
        y,
        size: bodySize,
        font,
        color: rgb(0, 0, 0),
      });

      const wrappedValues = wrapText(safeValue, pageWidth - activeValueX - 50, font, bodySize);
      for (let index = 0; index < wrappedValues.length; index += 1) {
        page.drawText(wrappedValues[index], {
          x: activeValueX,
          y,
          size: bodySize,
          font,
          color: rgb(0, 0, 0),
        });
        y -= lineGap;
      }
    };

    const drawSectionHeading = (text: string) => {
      drawLine(text, { italic: true, lineGap: 17 });
    };

    const title = 'FORM PERMOHONAN KERJA PRAKTIK';
    const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
    const titleX = (pageWidth - titleWidth) / 2;
    drawLine(title, { x: titleX, size: titleSize, bold: true, lineGap: 48 });

    drawSectionHeading('Saya yang bertanda tangan di bawah ini');
    y -= 12;

    drawLabelValue('Nama Mahasiswa', requestDetails.mahasiswaNama || '-');
    drawLabelValue('NIM', requestDetails.mahasiswaNim || '-');
    drawLabelValue('Program Studi', requestDetails.mahasiswaProdi || '-');
    drawLabelValue('Semester', requestDetails.mahasiswaSemester != null ? String(requestDetails.mahasiswaSemester) : '-');
    drawLabelValue('Tahun Ajaran', this.getAcademicYear(requestDetails.requestedAt));
    drawLabelValue(
      'Jumlah SKS yang sudah diselesaikan',
      `${requestDetails.mahasiswaJumlahSksSelesai ?? 0} sks`,
      15,
      { colonX: colonX + 28, valueX: colonX + 28 + 15 }
    );

    y -= 10;

    drawSectionHeading('Memohon untuk melakukan Kerja Praktik pada :');
    y -= 10;
    drawLabelValue('Nama Perusahaan', requestDetails.companyName || '-');
    drawLabelValue('Alamat Perusahaan', requestDetails.companyAddress || '-');
    drawLabelValue('Telepon Perusahaan', requestDetails.companyPhone || '-');
    drawLabelValue('Jenis Produk / Usaha', requestDetails.companyBusinessType || '-');
    drawLabelValue('Unit/Bagian Tempat KP', requestDetails.division || '-');

    y -= 10;

    drawSectionHeading('Dengan perincian sebagai berikut :');
    y -= 10;
    drawLabelValue('Lama Kerja Praktik', `(${lamaKp}) bulan`);
    drawLabelValue('Mulai Tanggal', this.formatDateSlashIndo(startDate));
    drawLabelValue('Selesai Tanggal', this.formatDateSlashIndo(endDate));

    y -= 10;

    drawSectionHeading('Dan menyatakan bersedia :');
    y -= 6;

    drawNumberedItem(
      '1.',
      'Menaati semua peraturan Kerja Praktik yang telah ditetapkan oleh Fakultas dan Perusahaan untuk pelaksanaan Kerja Praktik'
    );
    drawNumberedItem(
      '2.',
      'Tidak akan melakukan hal-hal yang dapat merugikan pihak lain serta mencemarkan nama baik diri sendiri, keluarga, pihak Fakultas serta perusahaan tempat melakukan Kerja Praktik'
    );
    drawNumberedItem(
      '3.',
      'Tidak akan menuntut atau meminta ganti rugi kepada pihak Fakultas dan Perusahaan apabila terjadi hal-hal yang tidak diinginkan saat Kerja Praktik (kehilangan, kecelakaan, dsb.) yang disebabkan oleh kecerobohan saya sendiri.'
    );

    y -= 14;

    const signedDate = this.formatTanggalIndonesia(new Date());
    const leftSignX = 78;
    const rightSignX = 392;

    const dateLine = `Palembang, ${signedDate}`;
    drawLine(dateLine, { x: rightSignX, lineGap: 16 });
    const signLabelY = y;
    page.drawText('Dosen Pembimbing,', {
      x: leftSignX,
      y: signLabelY,
      size: bodySize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    page.drawText('Pemohon,', {
      x: rightSignX,
      y: signLabelY,
      size: bodySize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 20;

    const signatureWidth = 122;
    const signatureHeight = 56;
    const signatureY = y - signatureHeight;

    try {
      const dosenImageBytes = new Uint8Array(dosenSigningContext.signatureImageBuffer);
      if (dosenSigningContext.signatureMimeType === 'image/png') {
        const pngImage = await pdfDoc.embedPng(dosenImageBytes);
        page.drawImage(pngImage, {
          x: leftSignX,
          y: signatureY,
          width: signatureWidth,
          height: signatureHeight,
        });
      } else {
        const jpgImage = await pdfDoc.embedJpg(dosenImageBytes);
        page.drawImage(jpgImage, {
          x: leftSignX,
          y: signatureY,
          width: signatureWidth,
          height: signatureHeight,
        });
      }

      const mahasiswaImageBytes = new Uint8Array(mahasiswaSigningContext.signatureImageBuffer);
      if (mahasiswaSigningContext.signatureMimeType === 'image/png') {
        const pngImage = await pdfDoc.embedPng(mahasiswaImageBytes);
        page.drawImage(pngImage, {
          x: rightSignX,
          y: signatureY,
          width: signatureWidth,
          height: signatureHeight,
        });
      } else {
        const jpgImage = await pdfDoc.embedJpg(mahasiswaImageBytes);
        page.drawImage(jpgImage, {
          x: rightSignX,
          y: signatureY,
          width: signatureWidth,
          height: signatureHeight,
        });
      }
    } catch {
      const error: Error = new Error('Gagal menyisipkan image e-signature ke PDF.');
      error.statusCode = 422;
      throw error;
    }

    const nameY = signatureY - 10;
    page.drawText(dosenSigningContext.dosenNama || '-', {
      x: leftSignX,
      y: nameY,
      size: bodySize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    const mahasiswaNamaText = mahasiswaSigningContext.mahasiswaNama || requestDetails.mahasiswaNama || '-';
    page.drawText(mahasiswaNamaText, {
      x: rightSignX,
      y: nameY,
      size: bodySize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    page.drawText(`NIP ${dosenSigningContext.dosenNip || '-'}`, {
      x: leftSignX,
      y: nameY - 16,
      size: bodySize,
      font,
      color: rgb(0, 0, 0),
    });
    const mahasiswaNimText = `NIM ${mahasiswaSigningContext.mahasiswaNim || requestDetails.mahasiswaNim || '-'}`;
    page.drawText(mahasiswaNimText, {
      x: rightSignX,
      y: nameY - 16,
      size: bodySize,
      font,
      color: rgb(0, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private calculateDurationInMonths(startDate: Date, endDate: Date): number {
    const startYearMonth = startDate.getFullYear() * 12 + startDate.getMonth();
    const endYearMonth = endDate.getFullYear() * 12 + endDate.getMonth();
    const diff = endYearMonth - startYearMonth;
    return Math.max(1, diff);
  }

  private getAcademicYear(value: string | Date | null | undefined): string {
    const date = this.toDate(value);
    const year = date ? date.getFullYear() : new Date().getFullYear();
    return `${year}/${year + 1}`;
  }

  private formatDateOnly(value: string | Date | null | undefined): string | null {
    const date = this.toDate(value);
    if (!date) return null;
    return new Intl.DateTimeFormat('sv-SE').format(date);
  }

  private formatTanggalIndonesia(date: Date) {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  private formatDateSlashIndo(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(date);
    const year = date.getFullYear();
    return `${day} / ${monthName} / ${year}`;
  }
}
