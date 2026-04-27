import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { SuratKesediaanRepository } from '@/repositories/surat-kesediaan.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { StorageService } from '@/services/storage.service';
import { generateId } from '@/utils/helpers';
import type { RbacRole } from '@/types';
import { createDbClient } from '@/db';
import { MahasiswaService } from './mahasiswa.service';
import { DosenService } from './dosen.service';
import { SsoSignatureProxyService } from './sso-signature-proxy.service';

const ALLOWED_SIGNATURE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];

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

export class SuratKesediaanService {
  private suratKesediaanRepo: SuratKesediaanRepository;
  private teamRepo: TeamRepository;
  private storageService: StorageService;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;
  private ssoSignatureProxyService: SsoSignatureProxyService;

  constructor(
    private env: CloudflareBindings
  ) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.suratKesediaanRepo = new SuratKesediaanRepository(db);
    this.teamRepo = new TeamRepository(db);
    this.storageService = new StorageService(this.env);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.dosenService = new DosenService(this.env);
    this.ssoSignatureProxyService = new SsoSignatureProxyService(this.env);
  }

  /**
   * Mahasiswa mengajukan surat kesediaan ke dosen
   */
  async requestSuratKesediaan(
    memberMahasiswaId: string,
    mahasiswaId: string,
    sessionId: string
  ) {
    // 1. Validate target member exists
    const memberMahasiswa = await this.mahasiswaService.getMahasiswaById(memberMahasiswaId, sessionId);
    if (!memberMahasiswa) {
      const error: Error = new Error('Pengguna tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    // 2. Resolve team context for self/teammate request
    const requestTeam = await this.resolveTeamForRequest(memberMahasiswa.id, mahasiswaId);

    // 3. Target dosen must follow team-level dosen_kp_id
    const dosenId = requestTeam.dosenKpId;
    if (!dosenId) {
      const error: Error = new Error('Dosen KP tim belum ditetapkan. Silakan hubungi admin.');
      error.statusCode = 422;
      throw error;
    }

    // 4. Validate dosen exists and active
    const dosenUser = await this.dosenService.getDosenById(dosenId, sessionId);
    if (!dosenUser) {
      const error: Error = new Error('Dosen tidak valid.');
      error.statusCode = 400;
      throw error;
    }

    // Guard: wakil dekan tidak menangani surat kesediaan
    if (dosenUser.jabatanStruktural.includes('WAKIL_DEKAN')) {
      const error: Error = new Error('Dosen ini tidak dapat menerima surat kesediaan.');
      error.statusCode = 400;
      throw error;
    }

    // 5. Prevent duplicate pending request for member+dosen
    const existing = await this.suratKesediaanRepo.findExistingPending(
      memberMahasiswaId,
      dosenId
    );
    if (existing) {
      const error: Error = new Error('Pengajuan surat kesediaan untuk mahasiswa ini sudah dalam proses.');
      error.statusCode = 409;
      throw error;
    }

    // 6. Create request
    const requestId = generateId();
    const result = await this.suratKesediaanRepo.create({
      id: requestId,
      memberMahasiswaId: memberMahasiswaId,
      dosenId: dosenId,
      status: 'MENUNGGU',
    });

    return { requestId: result.id };
  }

  /**
   * Dosen melihat list ajuan surat kesediaan
   */
  async getRequestsForDosen(dosenId: string, role: RbacRole, sessionId: string) {
    const requests =
      role === 'wakil_dekan'
        ? await this.suratKesediaanRepo.findAllWithDetails()
        : await this.suratKesediaanRepo.findByDosenIdWithDetails(dosenId);
    
    // Get dosen info for response
    const dosenProfile = await this.dosenService.getDosenById(dosenId, sessionId);
    
    return requests.map(req => ({
      id: req.id,
      tanggal: this.formatDateOnly(req.tanggal),
      nim: req.nim,
      namaMahasiswa: req.namaMahasiswa,
      programStudi: req.programStudi,
      angkatan: req.angkatan,
      semester: req.semester,
      email: req.email,
      noHp: req.noHp,
      jenisSurat: req.jenisSurat,
      status: req.status,
      dosenNama: dosenProfile?.profile?.fullName || 'Unknown',
      dosenNip: dosenProfile?.nidn || null,
      dosenJabatan: dosenProfile?.jabatanStruktural?.join(', ') || dosenProfile?.jabatanFungsional || 'Unknown',
      dosenEsignatureUrl: req.dosenEsignatureUrl,
      rejectedAt: req.status === 'DITOLAK' ? req.approvedAt : null,
      rejectionReason: req.status === 'DITOLAK' ? (req.rejectionReason ?? null) : null,
      approvedAt: req.approvedAt,
      signedFileUrl: req.signedFileUrl,
    }));
  }

  async rejectRequest(requestId: string, dosenId: string, reason: string) {
    const request = await this.suratKesediaanRepo.findById(requestId);
    if (!request) {
      const error: Error = new Error('Pengajuan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (request.dosenId !== dosenId) {
      const error: Error = new Error('Anda tidak berhak mengubah pengajuan ini.');
      error.statusCode = 403;
      throw error;
    }

    if (request.status !== 'MENUNGGU') {
      const error: Error = new Error('Pengajuan sudah diproses.');
      error.statusCode = 409;
      throw error;
    }

    const updated = await this.suratKesediaanRepo.rejectPending(requestId, dosenId, reason);
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
   * Mahasiswa ajukan ulang request yang sudah ditolak.
   * Requirement: update existing row, bukan create row baru.
   */
  async reapplyRequest(requestId: string, memberMahasiswaId: string, mahasiswaId: string) {
    if (memberMahasiswaId !== mahasiswaId) {
      const error: Error = new Error('Anda tidak memiliki akses untuk request ini.');
      error.statusCode = 403;
      throw error;
    }

    const request = await this.suratKesediaanRepo.findById(requestId);
    if (!request) {
      const error: Error = new Error('Request tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (request.memberMahasiswaId !== memberMahasiswaId) {
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

    const updated = await this.suratKesediaanRepo.reapplyRejected(requestId, memberMahasiswaId);
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

  /**
   * Dosen approve single request
   */
  async approveSingleRequest(
    requestId: string,
    dosenId: string,
    sessionId: string
  ) {
    console.log(`[approve] start requestId=${requestId} dosenId=${dosenId}`);
    const dosenSigningContext = await this.getDosenSigningContext(dosenId, sessionId);
    return await this.approveAndSignRequest(requestId,dosenId,dosenSigningContext);
  }

  /**
   * Dosen approve bulk requests
   */
  async approveBulkRequests(
    requestIds: string[],
    dosenId: string,
    sessionId: string
  ) {
    const failed: BulkApproveFailure[] = [];
    let approvedCount = 0;

    let dosenSigningContext: DosenSigningContext;
    try {
      dosenSigningContext = await this.getDosenSigningContext(dosenId, sessionId);
    } catch (error) {
      const err = error as Error;
      const reason = err.message || 'Gagal memuat e-signature dosen.';
      return {
        approvedCount,
        failed: requestIds.map((requestId) => ({ requestId, reason })),
      };
    }

    for (const requestId of requestIds) {
      try {
        await this.approveAndSignRequest(requestId, dosenId, dosenSigningContext);
        approvedCount += 1;
      } catch (error) {
        const err = error as Error;
        failed.push({
          requestId,
          reason: err.message || 'Gagal menyetujui pengajuan.',
        });
      }
    }

    return {
      approvedCount,
      failed,
    };
  }

  private async resolveTeamForRequest(memberMahasiswaId: string, mahasiswaId: string) {
    const memberTeams = await this.teamRepo.findTeamsByMahasiswaId(memberMahasiswaId);
    if (!memberTeams.length) {
      const error: Error = new Error('Mahasiswa belum tergabung dalam tim.');
      error.statusCode = 422;
      throw error;
    }

    if (memberMahasiswaId === mahasiswaId) {
      return this.pickPreferredTeam(memberTeams);
    }

    const authTeams = await this.teamRepo.findTeamsByMahasiswaId(mahasiswaId);
    const authTeamIds = new Set(authTeams.map((team) => team.id));
    const sharedTeams = memberTeams.filter((team) => authTeamIds.has(team.id));

    if (!sharedTeams.length) {
      const error: Error = new Error('Anda hanya dapat mengajukan untuk diri sendiri atau anggota tim yang valid.');
      error.statusCode = 403;
      throw error;
    }

    return this.pickPreferredTeam(sharedTeams);
  }

  private pickPreferredTeam<T extends { status: string }>(teams: T[]): T {
    const fixedTeam = teams.find((team) => team.status === 'FIXED');
    return fixedTeam || teams[0];
  }

  private async approveAndSignRequest(
    requestId: string,
    dosenId: string,
    dosenSigningContext: DosenSigningContext
  ) {
    console.log(`[approve] validating request ownership requestId=${requestId}`);
    const request = await this.suratKesediaanRepo.findById(requestId);
    if (!request) {
      const error: Error = new Error('Pengajuan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (request.dosenId !== dosenId) {
      const error: Error = new Error('Anda tidak berhak mengubah pengajuan ini.');
      error.statusCode = 403;
      throw error;
    }

    if (request.status !== 'MENUNGGU') {
      const error: Error = new Error('Pengajuan sudah diproses.');
      error.statusCode = 400;
      throw error;
    }

    console.log(`[approve] loading request details requestId=${requestId}`);
    const requestDetails = await this.suratKesediaanRepo.findByIdWithDetails(requestId);
    if (!requestDetails) {
      const error: Error = new Error('Detail pengajuan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    console.log(`[approve] generating signed PDF requestId=${requestId}`);
    const signedPdfBuffer = await this.generateSignedPdf(requestDetails, dosenSigningContext);
    console.log(`[approve] signed PDF generated requestId=${requestId} size=${signedPdfBuffer.byteLength}`);
    const signedFileName = `surat-kesediaan-signed-${requestId}.pdf`;

    console.log(`[approve] uploading signed PDF requestId=${requestId}`);
    const { url: signedFileUrl, key: signedFileKey } = await this.storageService.uploadFile(
      signedPdfBuffer,
      signedFileName,
      'surat-kesediaan/signed',
      'application/pdf'
    );
    console.log(`[approve] upload success requestId=${requestId} key=${signedFileKey} url=${signedFileUrl}`);

    if (!signedFileUrl || !signedFileKey) {
      const error: Error = new Error('Upload signed PDF gagal.');
      error.statusCode = 500;
      throw error;
    }

    const approvedAt = new Date();

    console.log(`[approve] updating DB requestId=${requestId}`);
    const updatedRequest = await this.suratKesediaanRepo.approveWithSignedFile(requestId, dosenId, {
      approvedByDosenId: dosenId,
      approvedAt,
      signedFileUrl,
      signedFileKey,
    });

    if (!updatedRequest) {
      try {
        await this.storageService.deleteFile(signedFileKey);
      } catch (cleanupError) {
        console.warn('[SuratKesediaanService] Failed to cleanup signed file after conditional update miss:', cleanupError);
      }

      const error: Error = new Error('Pengajuan sudah diproses.');
      error.statusCode = 400;
      throw error;
    }

    if (!updatedRequest.signedFileUrl || !updatedRequest.signedFileKey) {
      try {
        await this.storageService.deleteFile(signedFileKey);
      } catch (cleanupError) {
        console.warn('[SuratKesediaanService] Failed to cleanup signed file after missing DB metadata:', cleanupError);
      }

      const error: Error = new Error('Gagal menyimpan metadata file signed ke database.');
      error.statusCode = 500;
      throw error;
    }

    console.log(`[approve] db update success requestId=${requestId} signedFileUrl=${updatedRequest.signedFileUrl}`);
    console.log(`[approve] commit success requestId=${requestId}`);

    return {
      requestId,
      status: 'DISETUJUI' as const,
      approvedAt,
      signedFileUrl,
    };
  }

  private async getDosenSigningContext(dosenId: string, sessionId: string): Promise<DosenSigningContext> {
    const [dosenProfile, activeSignature] = await Promise.all([
      this.dosenService.getDosenById(dosenId, sessionId),
      this.ssoSignatureProxyService.getActiveSignature(sessionId),
    ]);

    if (!dosenProfile) {
      const error: Error = new Error('Profil dosen tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (!activeSignature) {
      const error: Error = new Error('E-signature dosen belum tersedia. Silakan lengkapi di halaman profil SSO.');
      error.statusCode = 422;
      throw error;
    }

    console.log(`[SuratKesediaanService.getDosenSigningContext] Active signature found: ${activeSignature.signatureId} (${activeSignature.mimeType})`);

    // Validate MIME Type
    if (!ALLOWED_SIGNATURE_MIME_TYPES.includes(activeSignature.mimeType)) {
      const error: Error = new Error(`Format file e-signature dosen tidak didukung (${activeSignature.mimeType}). Gunakan PNG/JPG/JPEG.`);
      error.statusCode = 422;
      throw error;
    }

    // Handle SVG or other image types
    let imageBuffer: Buffer;
    if (activeSignature.mimeType === 'image/svg+xml') {
      // NOTE: pdf-lib doesn't support SVG directly. 
      // If SSO returns SVG, we might need a converter.
      // However, for now we treat it as a buffer if it's passed as such, 
      // or we might need to ask the user if they want to support SVG.
      // Assuming the 'svg' field contains the actual content.
      imageBuffer = Buffer.from(activeSignature.svg);
    } else {
      // If it's PNG/JPG, 'svg' might be base64 encoded or raw content?
      // Based on the user's structure, we'll assume it's the data.
      // If it's base64 (common for JSON responses), we should decode it.
      const isBase64 = activeSignature.svg.startsWith('data:') || /^[A-Za-z0-9+/=]+$/.test(activeSignature.svg.substring(0, 100));
      imageBuffer = isBase64 
        ? Buffer.from(activeSignature.svg.replace(/^data:image\/\w+;base64,/, ''), 'base64')
        : Buffer.from(activeSignature.svg);
    }

    if (imageBuffer.length === 0) {
      const error: Error = new Error('File e-signature dosen kosong atau rusak.');
      error.statusCode = 422;
      throw error;
    }

    return {
      dosenNama: dosenProfile.profile?.fullName || '-',
      dosenNip: dosenProfile.nidn || null,
      dosenJabatan: dosenProfile.jabatanStruktural?.join(', ') || dosenProfile.jabatanFungsional || null,
      signatureImageBuffer: imageBuffer,
      signatureMimeType: activeSignature.mimeType,
    };
  }


  private async generateSignedPdf(
    requestDetails: Awaited<ReturnType<SuratKesediaanRepository['findByIdWithDetails']>>,
    dosenSigningContext: DosenSigningContext
  ): Promise<Buffer> {
    if (!requestDetails) {
      throw new Error('Detail pengajuan tidak ditemukan untuk pembuatan PDF.');
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const marginX = 62;
    const colonX = 178;
    const valueX = 194;
    const titleSize = 14;
    const bodySize = 12;
    const pageWidth = page.getWidth();

    let y = 780;

    const drawLine = (
      text: string,
      options?: { x?: number; size?: number; bold?: boolean; lineGap?: number }
    ) => {
      const x = options?.x ?? marginX;
      const size = options?.size ?? bodySize;
      const activeFont = options?.bold ? fontBold : font;

      page.drawText(text, {
        x,
        y,
        size,
        font: activeFont,
        color: rgb(0, 0, 0),
      });

      y -= options?.lineGap ?? 20;
    };

    const drawLabelValue = (label: string, value: string, lineGap: number = 20) => {
      const safeValue = value && value.trim() ? value : '-';
      page.drawText(label, {
        x: marginX + 14,
        y,
        size: bodySize,
        font,
        color: rgb(0, 0, 0),
      });
      page.drawText(':', {
        x: colonX,
        y,
        size: bodySize,
        font,
        color: rgb(0, 0, 0),
      });
      page.drawText(safeValue, {
        x: valueX,
        y,
        size: bodySize,
        font,
        color: rgb(0, 0, 0),
      });
      y -= lineGap;
    };

    const title = 'SURAT KESEDIAAN MEMBIMBING KP';
    const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
    const titleX = (pageWidth - titleWidth) / 2;
    drawLine(title, { x: titleX, size: titleSize, bold: true, lineGap: 62 });

    drawLine('Yang bertanda tangan di bawah ini :', { x: marginX + 3, lineGap: 34 });

    drawLabelValue('Nama', dosenSigningContext.dosenNama || '-');
    drawLabelValue('NIP', dosenSigningContext.dosenNip || '-');
    drawLabelValue('Jabatan', dosenSigningContext.dosenJabatan || '-', 36);

    drawLine('dengan ini menyatakan bersedia untuk membimbing kerja praktik mahasiswa berikut :', {
      x: marginX + 3,
      lineGap: 34,
    });

    drawLabelValue('Nama', requestDetails.mahasiswaNama || '-');
    drawLabelValue('NIM', requestDetails.mahasiswaNim || '-');
    drawLabelValue('Program Studi', requestDetails.mahasiswaProdi || '-', 48);

    drawLine('Demikianlah pernyataan ini dibuat agar maklum.', { x: marginX + 3, lineGap: 92 });

    const rightX = 368;
    const signedDate = this.formatTanggalIndonesia(new Date());
    drawLine(`Palembang, ${signedDate}`, { x: rightX });
    drawLine('Calon Dosen Pembimbing,', { x: rightX, lineGap: 40 });

    const signatureWidth = 180;
    const signatureHeight = 70;
    const signatureY = y - signatureHeight + 18;

    try {
      const imageBytes = new Uint8Array(dosenSigningContext.signatureImageBuffer);
      if (dosenSigningContext.signatureMimeType === 'image/png') {
        const pngImage = await pdfDoc.embedPng(imageBytes);
        page.drawImage(pngImage, {
          x: rightX,
          y: signatureY,
          width: signatureWidth,
          height: signatureHeight,
        });
      } else {
        const jpgImage = await pdfDoc.embedJpg(imageBytes);
        page.drawImage(jpgImage, {
          x: rightX,
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

    y = signatureY - 16;
    drawLine(dosenSigningContext.dosenNama || '-', { x: rightX });
    if (dosenSigningContext.dosenNip) {
      drawLine(`NIP ${dosenSigningContext.dosenNip}`, { x: rightX });
    } else {
      drawLine('NIP -', { x: rightX });
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  private formatTanggalIndonesia(date: Date) {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  private formatDateOnly(value: string | Date | null | undefined): string | null {
    const date = this.toDate(value);
    if (!date) return null;
    return new Intl.DateTimeFormat('sv-SE').format(date);
  }

  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
