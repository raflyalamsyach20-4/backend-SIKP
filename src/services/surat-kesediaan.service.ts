import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import { SuratKesediaanRepository } from '@/repositories/surat-kesediaan.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { StorageService } from '@/services/storage.service';
import { generateId } from '@/utils/helpers';
import type { RbacRole } from '@/types';
import { createDbClient } from '@/db';
import { MahasiswaService } from './mahasiswa.service';
import { DosenService } from './dosen.service';
import { SsoSignatureProxyService } from './sso-signature-proxy.service';

const ALLOWED_SIGNATURE_MIME_TYPES = ['image/svg+xml'];

type BulkApproveFailure = {
  requestId: string;
  reason: string;
};

type DosenSigningContext = {
  dosenNama: string;
  dosenNip: string | null;
  dosenJabatan: string | null;
  signatureSvg: string;
};

type MahasiswaSigningContext = {
  nama: string;
  nim: string | null;
  prodi: string | null;
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

  private getSignatureSource(activeSignature: Record<string, unknown>): string | null {
    const candidates = [
      activeSignature.signatureImage,
      activeSignature.signatureUrl,
      activeSignature.url,
      activeSignature.svg,
      activeSignature.data,
      activeSignature.content,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    return null;
  }

  private async resolveSignatureText(source: string): Promise<string> {
    if (/^https?:\/\//i.test(source)) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Gagal mengambil file e-signature dari URL (${response.status}).`);
      }

      return await response.text();
    }

    if (source.startsWith('data:')) {
      const commaIndex = source.indexOf(',');
      if (commaIndex === -1) {
        throw new Error('Format data URL e-signature tidak valid.');
      }

      const metadata = source.slice(5, commaIndex);
      const payload = source.slice(commaIndex + 1);

      if (/;base64/i.test(metadata)) {
        return Buffer.from(payload, 'base64').toString('utf8');
      }

      return decodeURIComponent(payload);
    }

    const cleaned = source.replace(/^data:image\/\w+;base64,/, '').replace(/\s+/g, '');
    const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(cleaned);
    return looksBase64 ? Buffer.from(cleaned, 'base64').toString('utf8') : source;
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

  private drawSignatureSvg(
    page: PDFPage,
    svgText: string,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const paths = this.extractSvgPathData(svgText);
    if (paths.length === 0) {
      throw new Error('File e-signature SVG tidak memiliki path yang bisa dirender.');
    }

    const box = this.extractSvgViewBox(svgText);
    const innerWidth = Math.max(width - 16, 1);
    const innerHeight = Math.max(height - 12, 1);
    const scale = Math.min(innerWidth / box.width, innerHeight / box.height);
    const scaledWidth = box.width * scale;
    const scaledHeight = box.height * scale;
    const offsetX = x + 8 + (innerWidth - scaledWidth) / 2;
    const offsetY = y + 6 + (innerHeight - scaledHeight) / 2;

    for (const pathData of paths) {
      page.drawSvgPath(pathData.d, {
        x: offsetX,
        y: offsetY,
        scale,
        borderColor: rgb(0, 0, 0),
        borderWidth: Math.max(pathData.strokeWidth * scale * 1.8, 0.9),
      });
    }
  }

  private toTitleCase(value: string): string {
    return value
      .split(/\s+/)
      .filter((token) => token.length > 0)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
      .join(' ');
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
    console.info('[SuratKesediaanService.getRequestsForDosen] start', {
      dosenId,
      role,
      sessionId,
    });

    const requests =
      role === 'wakil_dekan'
        ? await this.suratKesediaanRepo.findAllWithDetails()
        : await this.suratKesediaanRepo.findByDosenIdWithDetails(dosenId);

    console.info('[SuratKesediaanService.getRequestsForDosen] fetched-requests', {
      count: requests.length,
      ids: requests.map((req) => req.id),
    });
    
    // Get dosen info for response
    const dosenProfile = await this.dosenService.getDosenById(dosenId, sessionId);

    if (!dosenProfile) {
      console.warn('[SuratKesediaanService.getRequestsForDosen] dosen-profile-not-found', {
        dosenId,
      });
    }
    
    // Enrich requests with student and team data
    const enrichedRequests = await Promise.all(
      requests.map(async (req) => {
        const mahasiswaId = req.namaMahasiswa;
        console.info('[SuratKesediaanService.getRequestsForDosen] resolve-identities', {
          requestId: req.id,
          mahasiswaId,
          dosenId,
          status: req.status,
        });

        const mahasiswa = await this.mahasiswaService.getMahasiswaById(req.namaMahasiswa, sessionId);
        if (!mahasiswa) {
          console.warn('[SuratKesediaanService.getRequestsForDosen] mahasiswa-not-found', {
            requestId: req.id,
            mahasiswaId,
          });
        }

        const team = await this.teamRepo.findTeamsByMahasiswaId(req.namaMahasiswa);
        const preferredTeam = team && team.length > 0 ? team[0] : null;
        
        let teamMembers = undefined;
        if (preferredTeam) {
          const members = await this.teamRepo.findMembersByTeamId(preferredTeam.id);
          if (members.length > 0) {
            const enrichedMembers = await Promise.all(
              members.map(async (member) => {
                const memberData = await this.mahasiswaService.getMahasiswaById(member.mahasiswaId, sessionId);
                return {
                  id: member.id,
                  name: memberData?.profile?.fullName || member.mahasiswaId,
                  nim: memberData?.nim || null,
                  prodi: memberData?.prodi?.nama || null,
                  role: member.role === 'KETUA' ? 'Ketua' : 'Anggota',
                };
              })
            );
            teamMembers = enrichedMembers;
          }
        } else {
          console.warn('[SuratKesediaanService.getRequestsForDosen] team-not-found', {
            requestId: req.id,
            mahasiswaId,
          });
        }

        const supervisorName = preferredTeam?.dosenKpId
          ? (await this.dosenService.getDosenById(preferredTeam.dosenKpId, sessionId))?.profile?.fullName
          : undefined;

        return {
          id: req.id,
          memberMahasiswaId: req.namaMahasiswa,
          tanggal: this.formatDateOnly(req.tanggal),
          nim: mahasiswa?.nim || null,
          namaMahasiswa: mahasiswa?.profile?.fullName || 'Unknown',
          programStudi: mahasiswa?.prodi?.nama || null,
          angkatan: mahasiswa?.angkatan || null,
          semester: mahasiswa?.semesterAktif || null,
          email: mahasiswa?.profile?.emails?.[0]?.email || null,
          jenisSurat: req.jenisSurat,
          status: req.status,
          supervisor: supervisorName,
          teamMembers,
          dosenNama: dosenProfile?.profile?.fullName || 'Unknown',
          dosenNip: dosenProfile?.nip || null,
          dosenJabatan: dosenProfile?.jabatanStruktural?.join(', ') || dosenProfile?.jabatanFungsional || 'Unknown',
          dosenEsignatureUrl: req.dosenEsignatureUrl,
          rejectedAt: req.status === 'DITOLAK' ? req.approvedAt : null,
          rejectionReason: req.status === 'DITOLAK' ? (req.rejectionReason ?? null) : null,
          approvedAt: req.approvedAt,
          signedFileUrl: this.storageService.getAssetProxyUrl(req.signedFileUrl),
        };
      })
    );

    console.info('[SuratKesediaanService.getRequestsForDosen] done', {
      count: enrichedRequests.length,
      unknownMahasiswaCount: enrichedRequests.filter((item) => item.namaMahasiswa === 'Unknown').length,
    });
    
    return enrichedRequests;
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
    return await this.approveAndSignRequest(requestId, dosenId, sessionId, dosenSigningContext);
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
        await this.approveAndSignRequest(requestId, dosenId, sessionId, dosenSigningContext);
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
    sessionId: string,
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

    const mahasiswaProfile = await this.mahasiswaService.getMahasiswaById(requestDetails.memberMahasiswaId, sessionId);
    const mahasiswaSigningContext: MahasiswaSigningContext = {
      nama: mahasiswaProfile?.profile?.fullName || requestDetails.mahasiswaNama || 'Unknown',
      nim: mahasiswaProfile?.nim || requestDetails.mahasiswaNim || null,
      prodi: mahasiswaProfile?.prodi?.nama || requestDetails.mahasiswaProdi || null,
    };

    console.log(`[approve] generating signed PDF requestId=${requestId}`);
    const signedPdfBuffer = await this.generateSignedPdf(requestDetails, mahasiswaSigningContext, dosenSigningContext);
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

    const signatureSource = this.getSignatureSource(activeSignature as unknown as Record<string, unknown>);
    if (!signatureSource) {
      const error: Error = new Error('File e-signature dosen tidak tersedia.');
      error.statusCode = 422;
      throw error;
    }

    const signatureSvg = await this.resolveSignatureText(signatureSource);

    if (!signatureSvg.trim().startsWith('<svg')) {
      const error: Error = new Error('File e-signature dosen harus berupa SVG.');
      error.statusCode = 422;
      throw error;
    }

    return {
      dosenNama: dosenProfile.profile?.fullName || '-',
      dosenNip: dosenProfile.nip || null,
      dosenJabatan: dosenProfile.jabatanStruktural?.join(', ') || dosenProfile.jabatanFungsional || null,
      signatureSvg,
    };
  }


  private async generateSignedPdf(
    requestDetails: Awaited<ReturnType<SuratKesediaanRepository['findByIdWithDetails']>>,
    mahasiswaSigningContext: MahasiswaSigningContext,
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
    const dosenJabatan = dosenSigningContext.dosenJabatan
      ? this.toTitleCase(dosenSigningContext.dosenJabatan)
      : '-';
    drawLabelValue('Jabatan', dosenJabatan, 36);

    drawLine('dengan ini menyatakan bersedia untuk membimbing kerja praktik mahasiswa berikut :', {
      x: marginX + 3,
      lineGap: 34,
    });

    drawLabelValue('Nama', mahasiswaSigningContext.nama || requestDetails.mahasiswaNama || '-');
    drawLabelValue('NIM', mahasiswaSigningContext.nim || requestDetails.mahasiswaNim || '-');
    drawLabelValue('Program Studi', mahasiswaSigningContext.prodi || requestDetails.mahasiswaProdi || '-', 48);

    drawLine('Demikianlah pernyataan ini dibuat agar maklum.', { x: marginX + 3, lineGap: 92 });

    const rightX = 368;
    const signedDate = this.formatTanggalIndonesia(new Date());
    drawLine(`Palembang, ${signedDate}`, { x: rightX });
    drawLine('Calon Dosen Pembimbing,', { x: rightX, lineGap: 40 });

    const signatureWidth = 220;
    const signatureHeight = 90;
    const signatureBaseY = y - signatureHeight + 58;
    const signatureOffsetX = -30; //atur kiri-kanan e-sign
    const signatureOffsetY = 20; //atur atas-bawah e-sign
    const signatureX = rightX + signatureOffsetX;
    const signatureY = signatureBaseY + signatureOffsetY;

    try {
      this.drawSignatureSvg(page, dosenSigningContext.signatureSvg, signatureX, signatureY, signatureWidth, signatureHeight);
    } catch {
      const error: Error = new Error('Gagal menyisipkan image e-signature ke PDF.');
      error.statusCode = 422;
      throw error;
    }

    y = signatureBaseY - 16;
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
