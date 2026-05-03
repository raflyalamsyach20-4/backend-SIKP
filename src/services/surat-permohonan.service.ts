import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import { SuratPermohonanRepository } from '@/repositories/surat-permohonan.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { StorageService } from '@/services/storage.service';
import { generateId } from '@/utils/helpers';
import type { RbacRole } from '@/types';
import { createDbClient } from '@/db';
import { DosenService } from './dosen.service';
import { MahasiswaService } from './mahasiswa.service';
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

type MahasiswaSigningContext = {
  mahasiswaNama: string;
  mahasiswaNim: string | null;
  mahasiswaProdi: string | null;
  mahasiswaSemester: number | null;
  mahasiswaAngkatan: number | null;
  mahasiswaJumlahSksSelesai?: number | null;
  signatureImageBuffer: Buffer;
  signatureMimeType: string;
  signatureSourceUrl: string;
};

type MahasiswaRequestProfile = {
  nama: string;
  nim: string | null;
  prodi: string | null;
  semester: number | null;
  angkatan: number | null;
  jumlahSks: number | null;
};

export class SuratPermohonanService {
  private suratPermohonanRepo: SuratPermohonanRepository;
  private teamRepo: TeamRepository;
  private submissionRepo: SubmissionRepository;
  private storageService: StorageService;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;
  private ssoSignatureProxyService: SsoSignatureProxyService;

  constructor(
    private env: CloudflareBindings
  ) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.suratPermohonanRepo = new SuratPermohonanRepository(db);
    this.teamRepo = new TeamRepository(db);
    this.submissionRepo = new SubmissionRepository(db);
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

  private async resolveSignatureBuffer(source: string): Promise<Buffer> {
    if (/^https?:\/\//i.test(source)) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Gagal mengambil file e-signature dari URL (${response.status}).`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    if (source.startsWith('data:')) {
      const commaIndex = source.indexOf(',');
      if (commaIndex === -1) {
        throw new Error('Format data URL e-signature tidak valid.');
      }

      const metadata = source.slice(5, commaIndex);
      const payload = source.slice(commaIndex + 1);

      if (/;base64/i.test(metadata)) {
        return Buffer.from(payload, 'base64');
      }

      return Buffer.from(decodeURIComponent(payload), 'utf8');
    }

    const cleaned = source.replace(/^data:image\/\w+;base64,/, '').replace(/\s+/g, '');
    const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(cleaned);
    return Buffer.from(looksBase64 ? cleaned : source, looksBase64 ? 'base64' : 'utf8');
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

    //atur posisi e-sign
    const box = this.extractSvgViewBox(svgText);
    const paddingX = Math.max(width * 0.05, 6);
    const paddingY = Math.max(height * 0.06, 6);
    const innerWidth = Math.max(width - paddingX * 2, 1);
    const innerHeight = Math.max(height - paddingY * 2, 1);

    // Slightly enlarge to make signature more prominent but keep aspect ratio
    const baseScale = Math.min(innerWidth / box.width, innerHeight / box.height);
    const scale = baseScale * 5.08;
    const scaledWidth = box.width * scale;
    const scaledHeight = box.height * scale;

    // Center the signature inside the allotted box
    const offsetX = x + (width - scaledWidth) / 2;
    const offsetY = y + (height - scaledHeight) / 2;

    for (const pathData of paths) {
      page.drawSvgPath(pathData.d, {
        x: offsetX,
        y: offsetY,
        scale,
        borderColor: rgb(0, 0, 0),
        // Increase stroke width multiplier for bolder appearance
        borderWidth: Math.max(pathData.strokeWidth * scale * 4.2, 1.0),
      });
    }
  }

  /**
   * Mahasiswa mengajukan surat permohonan KP.
   */
  async requestSuratPermohonan(memberMahasiswaId: string, mahasiswaId: string, sessionId:string) {
    const memberMahasiswa = await this.mahasiswaService.getMahasiswaById(memberMahasiswaId, sessionId);
    if (!memberMahasiswa) {
      const error: Error = new Error('Mahasiswa tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    const fixedTeam = await this.resolveFixedTeamForRequest(memberMahasiswaId, mahasiswaId);
    const submission = await this.resolveSubmissionByTeamId(fixedTeam.id);

    if (!submission.companyName || !submission.startDate || !submission.endDate) {
      const error: Error = new Error('Data perusahaan belum lengkap. Isi terlebih dahulu nama perusahaan, tanggal mulai, dan tanggal selesai KP.');
      error.statusCode = 422;
      throw error;
    }

    const dosenId = fixedTeam.dosenKpId || null;
    if (!dosenId) {
      const error: Error = new Error('Dosen KP tim belum ditetapkan. Silakan hubungi admin.');
      error.statusCode = 422;
      throw error;
    }

    const dosen = await this.dosenService.getDosenById(dosenId, sessionId);
    if (!dosen) {
      const error: Error = new Error('Dosen tidak ditemukan.');
      error.statusCode = 400;
      throw error;
    }

    const existing = await this.suratPermohonanRepo.findExistingPending(memberMahasiswaId,dosenId);
    if (existing) {
      const error: Error = new Error('Pengajuan surat permohonan untuk mahasiswa ini sudah dalam proses.');
      error.statusCode = 409;
      throw error;
    }

    const mahasiswaEsignatureUrl = await this.resolveMahasiswaEsignatureUrl(memberMahasiswaId, sessionId);

    const requestId = generateId();
    await this.suratPermohonanRepo.create({
      id: requestId,
      memberMahasiswaId: memberMahasiswaId,
      dosenId: dosenId,
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
  async getRequestsForDosen(dosenId: string, role: RbacRole, sessionId: string) {
    console.info('[SuratPermohonanService.getRequestsForDosen] start', {
      dosenId,
      role,
      sessionId,
    });

    const requests =
      role === 'wakil_dekan'
        ? await this.suratPermohonanRepo.findAllWithDetails()
        : await this.suratPermohonanRepo.findByDosenIdWithDetails(dosenId);

    console.info('[SuratPermohonanService.getRequestsForDosen] fetched-requests', {
      count: requests.length,
      ids: requests.map((req) => req.id),
    });

    // Enrich requests with student and dosen data
    const enrichedRequests = await Promise.all(
      requests.map(async (req) => {
        const mahasiswaId = req.memberMahasiswaId || req.namaMahasiswa;
        console.info('[SuratPermohonanService.getRequestsForDosen] resolve-identities', {
          requestId: req.id,
          mahasiswaId,
          dosenId: req.dosenId,
          status: req.status,
        });

        const mahasiswa = await this.mahasiswaService.getMahasiswaById(mahasiswaId, sessionId);
        const dosen = await this.dosenService.getDosenById(req.dosenId, sessionId);

        if (!mahasiswa) {
          console.warn('[SuratPermohonanService.getRequestsForDosen] mahasiswa-not-found', {
            requestId: req.id,
            mahasiswaId,
          });
        }

        if (!dosen) {
          console.warn('[SuratPermohonanService.getRequestsForDosen] dosen-not-found', {
            requestId: req.id,
            dosenId: req.dosenId,
          });
        }
        
        const team = await this.teamRepo.findTeamsByMahasiswaId(mahasiswaId);
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
          console.warn('[SuratPermohonanService.getRequestsForDosen] team-not-found', {
            requestId: req.id,
            mahasiswaId,
          });
        }

        const supervisorName = preferredTeam?.dosenKpId
          ? (await this.dosenService.getDosenById(preferredTeam.dosenKpId, sessionId))?.profile?.fullName
          : undefined;

        const proxiedMahasiswaEsignatureUrl = this.storageService.getEsignatureAssetProxyUrlFromPublicUrl(req.mahasiswaEsignatureUrl);

        return {
          id: req.id,
          memberMahasiswaId: mahasiswaId,
          tanggal: this.formatDateOnly(req.tanggal),
          nim: mahasiswa?.nim || null,
          namaMahasiswa: mahasiswa?.profile?.fullName || 'Unknown',
          programStudi: mahasiswa?.prodi?.nama || null,
          angkatan: mahasiswa?.angkatan || null,
          semester: mahasiswa?.semesterAktif != null ? String(mahasiswa.semesterAktif) : null,
          jumlahSks: mahasiswa?.jumlahSksLulus != null ? String(mahasiswa.jumlahSksLulus) : null,
          tahunAjaran: this.getAcademicYear(req.tanggal),
          email: mahasiswa?.profile?.emails?.[0]?.email || null,
          noHp: null,
          jenisSurat: req.jenisSurat,
          status: req.status,
          supervisor: supervisorName,
          teamMembers,
          mahasiswaEsignatureUrl: proxiedMahasiswaEsignatureUrl,
          mahasiswa_esignature_url: proxiedMahasiswaEsignatureUrl,
          mahasiswaEsignatureSnapshotAt: req.mahasiswaEsignatureSnapshotAt,
          dosenNama: dosen?.profile?.fullName || '-',
          dosenNip: dosen?.nip || null,
          dosenJabatan: dosen?.jabatanStruktural?.join(', ') || dosen?.jabatanFungsional || '-',
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
      })
    );

    console.info('[SuratPermohonanService.getRequestsForDosen] done', {
      count: enrichedRequests.length,
      unknownMahasiswaCount: enrichedRequests.filter((item) => item.namaMahasiswa === 'Unknown').length,
    });
    
    return enrichedRequests;
  }

  async approveSingleRequest(requestId: string, dosenId: string, sessionId: string) {
    const dosenSigningContext = await this.getDosenSigningContext(dosenId, sessionId);
    return await this.approveAndSignRequest(requestId, dosenId, dosenSigningContext,sessionId);
  }

  async approveBulkRequests(requestIds: string[], dosenId: string, sessionId: string) {
    const failed: BulkApproveFailure[] = [];
    let approvedCount = 0;

    let dosenSigningContext: DosenSigningContext;
    try {
      dosenSigningContext = await this.getDosenSigningContext(dosenId, sessionId);
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
        await this.approveAndSignRequest(requestId, dosenId, dosenSigningContext,sessionId);
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

  async rejectRequest(requestId: string, dosenId: string, reason: string) {
    const request = await this.suratPermohonanRepo.findById(requestId);
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

    const updated = await this.suratPermohonanRepo.rejectPending(requestId, dosenId, reason.trim());
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
  async reapplyRequest(requestId: string, memberMahasiswaId: string, mahasiswaId: string, sessionId:string) {
    if (memberMahasiswaId !== mahasiswaId) {
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

    const mahasiswaEsignatureUrl = await this.resolveMahasiswaEsignatureUrl(memberMahasiswaId, sessionId);

    const updated = await this.suratPermohonanRepo.reapplyRejected(requestId, memberMahasiswaId, {
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
    dosenId: string,
    dosenSigningContext: DosenSigningContext,
    sessionId:string
  ) {
    const request = await this.suratPermohonanRepo.findById(requestId);
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

    const mahasiswaRequestProfile = await this.resolveMahasiswaRequestProfile(requestDetails, sessionId);
    const mahasiswaSigningContext = await this.getMahasiswaSigningContext(requestDetails, sessionId);

    const signedPdfBuffer = await this.generateSignedPdf(
      requestDetails,
      mahasiswaRequestProfile,
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
    const updatedRequest = await this.suratPermohonanRepo.approveWithSignedFile(requestId, dosenId, {
      approvedByDosenId: dosenId,
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

  private async resolveFixedTeamForRequest(memberMahasiswaId: string, mahasiswaId: string) {
    const memberTeams = (await this.teamRepo.findTeamsByMahasiswaId(memberMahasiswaId)).filter((team) => team.status === 'FIXED');

    if (memberTeams.length === 0) {
      const error: Error = new Error('Mahasiswa belum menetapkan tim.');
      error.statusCode = 422;
      throw error;
    }

    if (memberMahasiswaId === mahasiswaId) {
      return memberTeams[0];
    }

    const authTeamIds = new Set(
      (await this.teamRepo.findTeamsByMahasiswaId(mahasiswaId))
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

  private async resolveMahasiswaEsignatureUrl(memberMahasiswaId: string, sessionId: string): Promise<string> {
    const [mahasiswaProfile, activeSignature] = await Promise.all([
      this.mahasiswaService.getMahasiswaById(memberMahasiswaId, sessionId),
      this.ssoSignatureProxyService.getActiveSignature(sessionId),
    ]);

    if (!mahasiswaProfile) {
      const error: Error = new Error('Profil mahasiswa tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (!activeSignature) {
      const error: Error = new Error('Mahasiswa belum memiliki tanda tangan digital di SSO. Silakan lengkapi di halaman profil SSO.');
      error.statusCode = 422;
      throw error;
    }

    const signatureSource = this.getSignatureSource(activeSignature as unknown as Record<string, unknown>);
    if (!signatureSource) {
      const error: Error = new Error('File e-signature mahasiswa tidak tersedia. Silakan lengkapi di halaman profil SSO.');
      error.statusCode = 422;
      throw error;
    }

    // SNAPSHOT: Upload to SIKP storage to keep a persistent record at time of request
    const imageBuffer = await this.resolveSignatureBuffer(signatureSource);

    if (imageBuffer.length === 0) {
      const error: Error = new Error('File e-signature mahasiswa kosong atau rusak.');
      error.statusCode = 422;
      throw error;
    }

    const ext = activeSignature.mimeType === 'image/svg+xml' ? 'svg' : (activeSignature.mimeType.split('/')[1] || 'png');
    const fileName = `mahasiswa-signature-${memberMahasiswaId}-${Date.now()}.${ext}`;
    
    const { url } = await this.storageService.uploadFile(
      imageBuffer,
      fileName,
      'esignatures/mahasiswa',
      activeSignature.mimeType
    );

    return url;
  }

  private async resolveMahasiswaEsignatureUrlForApproval(
    requestDetails: Awaited<ReturnType<SuratPermohonanRepository['findByIdWithDetails']>>,
    sessionId:string
  ): Promise<string> {
    if (!requestDetails) {
      const error: Error = new Error('Detail pengajuan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    if (requestDetails.mahasiswaEsignatureUrl) {
      return requestDetails.mahasiswaEsignatureUrl;
    }

    const error: Error = new Error('Gagal mengakses file e-signature mahasiswa. Tanda tangan mahasiswa tidak ditemukan pada data pengajuan. Silakan minta mahasiswa untuk membatalkan dan mengajukan ulang.');
    error.statusCode = 422;
    throw error;
  }

  private async getMahasiswaSigningContext(
    requestDetails: Awaited<ReturnType<SuratPermohonanRepository['findByIdWithDetails']>>,
    sessionId:string
  ): Promise<MahasiswaSigningContext> {
    if (!requestDetails) {
      const error: Error = new Error('Detail pengajuan tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    const mahasiswaEsignatureUrl = await this.resolveMahasiswaEsignatureUrlForApproval(requestDetails, sessionId);
    const mahasiswaProfile = await this.mahasiswaService.getMahasiswaById(requestDetails.memberMahasiswaId, sessionId);
    
    // Download snapshot from R2
    const { imageBuffer, mimeType } = await this.downloadAndValidateSignatureImage(
      mahasiswaEsignatureUrl,
      'mahasiswa'
    );

    return {
      mahasiswaNama: mahasiswaProfile?.profile?.fullName || requestDetails.mahasiswaNama || '-',
      mahasiswaNim: mahasiswaProfile?.nim || requestDetails.mahasiswaNim || null,
      mahasiswaProdi: mahasiswaProfile?.prodi?.nama || requestDetails.mahasiswaProdi || null,
      mahasiswaSemester: mahasiswaProfile?.semesterAktif ?? requestDetails.mahasiswaSemester ?? null,
      mahasiswaAngkatan: mahasiswaProfile?.angkatan ?? requestDetails.mahasiswaAngkatan ?? null,
      mahasiswaJumlahSksSelesai: mahasiswaProfile?.jumlahSksLulus ?? requestDetails.mahasiswaJumlahSksSelesai ?? null,
      signatureImageBuffer: imageBuffer,
      signatureMimeType: mimeType,
      signatureSourceUrl: mahasiswaEsignatureUrl,
    };
  }

  private async resolveMahasiswaRequestProfile(
    requestDetails: Awaited<ReturnType<SuratPermohonanRepository['findByIdWithDetails']>>,
    sessionId: string
  ): Promise<MahasiswaRequestProfile> {
    const mahasiswaProfile = await this.mahasiswaService.getMahasiswaById(requestDetails.memberMahasiswaId, sessionId);

    return {
      nama: mahasiswaProfile?.profile?.fullName || requestDetails.mahasiswaNama || '-',
      nim: mahasiswaProfile?.nim || requestDetails.mahasiswaNim || null,
      prodi: mahasiswaProfile?.prodi?.nama || requestDetails.mahasiswaProdi || null,
      semester: mahasiswaProfile?.semesterAktif ?? requestDetails.mahasiswaSemester ?? null,
      angkatan: mahasiswaProfile?.angkatan ?? requestDetails.mahasiswaAngkatan ?? null,
      jumlahSks: mahasiswaProfile?.jumlahSksLulus ?? requestDetails.mahasiswaJumlahSksSelesai ?? null,
    };
  }

  private async getDosenSigningContext(dosenId: string, sessionId: string): Promise<DosenSigningContext> {
    console.log(`[SuratPermohonanService.getDosenSigningContext] Fetching context dosenId=${dosenId}`);
    
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
      console.error(`[SuratPermohonanService.getDosenSigningContext] SSO returned null activeSignature. sessionId=${sessionId}`);
      const error: Error = new Error('E-signature dosen belum tersedia. Silakan lengkapi di halaman profil SSO.');
      error.statusCode = 422;
      throw error;
    }

    console.log(`[SuratPermohonanService.getDosenSigningContext] Active signature found: ${activeSignature.signatureId} (${activeSignature.mimeType})`);

    // Handle SVG or other image types
    let imageBuffer: Buffer;
    if (activeSignature.mimeType === 'image/svg+xml') {
      imageBuffer = Buffer.from(activeSignature.svg);
    } else {
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
      dosenNip: dosenProfile.nip || null,
      dosenJabatan: dosenProfile.jabatanStruktural?.join(', ') || dosenProfile.jabatanFungsional || null,
      signatureImageBuffer: imageBuffer,
      signatureMimeType: activeSignature.mimeType,
    };
  }

  private async downloadAndValidateSignatureImage(
    esignatureUrl: string,
    ownerLabel: 'dosen' | 'mahasiswa'
  ) {
    let mimeType = '';
    let imageArrayBuffer: ArrayBuffer | undefined;

    const r2Domain = (this.env.R2_DOMAIN || '').replace(/\/$/, '');
    if (r2Domain && esignatureUrl.startsWith(`${r2Domain}/`)) {
      const key = esignatureUrl.slice(r2Domain.length + 1);
      const file = await this.storageService.getFile(key);
      if (file) {
        mimeType = file.httpMetadata?.contentType || 'application/octet-stream';
        if (typeof (file as { arrayBuffer?: unknown }).arrayBuffer === 'function') {
          imageArrayBuffer = await (file as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
        } else if (file.body) {
          if (file.body instanceof ArrayBuffer) {
            imageArrayBuffer = file.body;
          } else if (ArrayBuffer.isView(file.body)) {
            const view = file.body as ArrayBufferView;
            imageArrayBuffer = Uint8Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)).buffer;
          } else if (file.body instanceof Blob) {
            imageArrayBuffer = await file.body.arrayBuffer();
          } else {
            imageArrayBuffer = await new Response(file.body as BodyInit).arrayBuffer();
          }
        }
      }
    }

    if (!imageArrayBuffer) {
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

      mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      imageArrayBuffer = await response.arrayBuffer();
    }

    if (!ALLOWED_SIGNATURE_MIME_TYPES.includes(mimeType)) {
      const error: Error = new Error(`Format file e-signature ${ownerLabel} tidak valid. Gunakan PNG/JPG/JPEG.`);
      error.statusCode = 422;
      throw error;
    }

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
    mahasiswaRequestProfile: MahasiswaRequestProfile,
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

    drawLabelValue('Nama Mahasiswa', mahasiswaRequestProfile.nama || '-');
    drawLabelValue('NIM', mahasiswaRequestProfile.nim || '-');
    drawLabelValue('Program Studi', mahasiswaRequestProfile.prodi || '-');
    drawLabelValue('Semester', mahasiswaRequestProfile.semester != null ? String(mahasiswaRequestProfile.semester) : '-');
    drawLabelValue('Tahun Ajaran', this.getAcademicYear(requestDetails.requestedAt));
    drawLabelValue(
      'Jumlah SKS yang sudah diselesaikan',
      `${mahasiswaRequestProfile.jumlahSks ?? 0} sks`,
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
    // tweak these to shift signature images horizontally (positive => right, negative => left)
    const signatureShiftLeft = -50; // adjust to move dosen signature
    const signatureShiftRight = -35; // adjust to move mahasiswa signature
    // tweak this to shift signatures vertically (positive => up, negative => down)
    const signatureShiftY = 50; // adjust to move both signatures vertically

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

    const signatureWidth = 200;
    const signatureHeight = 25;
    const signatureY = y - signatureHeight;
    const signerTextY = y - 68;

    try {
      const dosenImageBytes = new Uint8Array(dosenSigningContext.signatureImageBuffer);
      if (dosenSigningContext.signatureMimeType === 'image/svg+xml') {
        const svgText = Buffer.from(dosenImageBytes).toString('utf8');
        this.drawSignatureSvg(page, svgText, leftSignX + signatureShiftLeft, signatureY + signatureShiftY, signatureWidth, signatureHeight);
      } else {
        // For raster images, embed and draw centered and slightly larger for clarity
        const isPng = dosenSigningContext.signatureMimeType === 'image/png';
        const embedded = isPng ? await pdfDoc.embedPng(dosenImageBytes) : await pdfDoc.embedJpg(dosenImageBytes);
        const enlargeW = signatureWidth * 1.12;
        const enlargeH = signatureHeight * 1.18;
        const drawX = leftSignX + signatureShiftLeft - (enlargeW - signatureWidth) / 2;
        const drawY = signatureY + signatureShiftY - (enlargeH - signatureHeight) / 2;
        page.drawImage(embedded, { x: drawX, y: drawY, width: enlargeW, height: enlargeH });
      }

      const mahasiswaImageBytes = new Uint8Array(mahasiswaSigningContext.signatureImageBuffer);
      if (mahasiswaSigningContext.signatureMimeType === 'image/svg+xml') {
        const svgText = Buffer.from(mahasiswaImageBytes).toString('utf8');
        this.drawSignatureSvg(page, svgText, rightSignX + signatureShiftRight, signatureY + signatureShiftY, signatureWidth, signatureHeight);
      } else {
        const isPng = mahasiswaSigningContext.signatureMimeType === 'image/png';
        const embedded = isPng ? await pdfDoc.embedPng(mahasiswaImageBytes) : await pdfDoc.embedJpg(mahasiswaImageBytes);
        const enlargeW = signatureWidth * 1.12;
        const enlargeH = signatureHeight * 1.18;
        const drawX = rightSignX + signatureShiftRight - (enlargeW - signatureWidth) / 2;
        const drawY = signatureY + signatureShiftY - (enlargeH - signatureHeight) / 2;
        page.drawImage(embedded, { x: drawX, y: drawY, width: enlargeW, height: enlargeH });
      }
    } catch {
      const error: Error = new Error('Gagal menyisipkan image e-signature ke PDF.');
      error.statusCode = 422;
      throw error;
    }

    const nameY = signerTextY;
    page.drawText(dosenSigningContext.dosenNama || '-', {
      x: leftSignX,
      y: nameY,
      size: bodySize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    const mahasiswaNamaText = mahasiswaSigningContext.mahasiswaNama || mahasiswaRequestProfile.nama || '-';
    page.drawText(mahasiswaNamaText, {
      x: rightSignX,
      y: nameY,
      size: bodySize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    page.drawText(`NIP ${dosenSigningContext.dosenNip || '-'}`, {
      x: leftSignX,
      y: signerTextY - 16,
      size: bodySize,
      font,
      color: rgb(0, 0, 0),
    });
    const mahasiswaNimText = `NIM ${mahasiswaSigningContext.mahasiswaNim || mahasiswaRequestProfile.nim || '-'}`;
    page.drawText(mahasiswaNimText, {
      x: rightSignX,
      y: signerTextY - 16,
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
