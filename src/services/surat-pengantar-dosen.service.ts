import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { UserRepository } from '@/repositories/user.repository';
import { StorageService } from '@/services/storage.service';
import { generateId } from '@/utils/helpers';
import type { UserRole } from '@/types';

type VerifierContext = {
  userId: string;
  role: UserRole;
  nama: string | null;
  nip: string | null;
  jabatan: string | null;
  prodi: string | null;
  esignatureUrl: string | null;
};

type SigningContext = VerifierContext & {
  signatureImageBuffer: Buffer;
  signatureMimeType: string;
};

export class SuratPengantarDosenService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private teamRepo: TeamRepository,
    private userRepo: UserRepository,
    private storageService: StorageService
  ) {}

  async getRequestsForVerifier(userId: string, role: UserRole) {
    const verifier = await this.resolveVerifierContext(userId, role);
    const allSubmissions = await this.submissionRepo.findAll();
    const submissions = allSubmissions.filter((submission: any) => {
      const isPendingQueue = submission.workflowStage === 'PENDING_DOSEN_VERIFICATION';
      const isVerifierHistory =
        (submission.workflowStage === 'COMPLETED' || submission.workflowStage === 'REJECTED_DOSEN') &&
        submission.dosenVerifiedBy === verifier.userId;

      const effectiveAdminStatus = this.getEffectiveAdminStatus(submission);
      const isLegacyQueue =
        submission.status === 'APPROVED' &&
        effectiveAdminStatus === 'APPROVED' &&
        submission.dosenVerificationStatus !== 'APPROVED' &&
        submission.workflowStage !== 'COMPLETED' &&
        !submission.finalSignedFileUrl;

      // Keep archived rows as history (admin behaves similarly),
      // but never treat archived rows as active queue.
      if (submission.archivedAt != null) {
        return isVerifierHistory;
      }

      return isPendingQueue || isVerifierHistory || isLegacyQueue;
    });

    console.log('[SuratPengantarDosenService.getRequestsForVerifier]', {
      verifierUserId: verifier.userId,
      role: verifier.role,
      jabatan: verifier.jabatan,
      prodi: verifier.prodi,
      isAcademicViceDean: this.isAcademicViceDean(verifier),
      totalSubmissions: allSubmissions.length,
      queueCandidates: submissions.map((s: any) => ({
        id: s.id,
        workflowStage: s.workflowStage,
        adminVerificationStatus: s.adminVerificationStatus,
        dosenVerificationStatus: s.dosenVerificationStatus,
      })),
    });

    const items: any[] = [];

    for (const submission of submissions) {
      const team = await this.teamRepo.findById(submission.teamId);

      const isHistoryRow = submission.workflowStage === 'COMPLETED' || submission.workflowStage === 'REJECTED_DOSEN';
      const allowed = isHistoryRow
        ? submission.dosenVerifiedBy === verifier.userId
        : await this.canVerifierAccessSubmission(verifier, team?.leaderId);

      console.log('[VerifierAccessCheck]', {
        submissionId: submission.id,
        leaderId: team?.leaderId ?? null,
        verifierRole: verifier.role,
        verifierJabatan: verifier.jabatan,
        verifierProdi: verifier.prodi,
        allowed,
      });

      if (!allowed) continue;

      const members = team ? await this.teamRepo.findMembersWithUserDataByTeamId(team.id) : [];
      const acceptedMembers = members.filter((member) => member.invitationStatus === 'ACCEPTED');
      const leaderMember = team
        ? acceptedMembers.find((member) => member.userId === team.leaderId) ?? acceptedMembers[0]
        : null;
      const fallbackStudent = await this.resolveFallbackStudentProfile(submission.id);
      const effectiveAdminStatus = this.getEffectiveAdminStatus(submission);
      const submissionStage = submission.workflowStage ?? 'PENDING_DOSEN_VERIFICATION';
      const submissionStatus =
        submissionStage === 'COMPLETED'
          ? 'DISETUJUI'
          : submissionStage === 'REJECTED_DOSEN'
            ? 'DITOLAK'
            : 'MENUNGGU';

      items.push({
        id: submission.id,
        requestId: submission.id,
        submissionId: submission.id,
        teamId: team?.id,
        teamCode: team?.code ?? 'TEAM_DIBUBARKAN',
        nim: leaderMember?.user.nim ?? fallbackStudent?.nim ?? null,
        namaMahasiswa:
          leaderMember?.user.nama ?? fallbackStudent?.nama ?? 'Data tim sudah dibubarkan',
        programStudi: leaderMember?.user.prodi ?? fallbackStudent?.prodi ?? null,
        angkatan: leaderMember?.user.angkatan ?? fallbackStudent?.angkatan ?? null,
        semester: leaderMember?.user.semester ?? fallbackStudent?.semester ?? null,
        email: leaderMember?.user.email ?? fallbackStudent?.email ?? null,
        noHp: leaderMember?.user.phone ?? fallbackStudent?.phone ?? null,
        tanggal: submission.submittedAt ?? submission.updatedAt ?? submission.createdAt,
        status: submissionStatus,
        jenisSurat: 'Surat Pengantar',
        isAdminApproved: effectiveAdminStatus === 'APPROVED',
        adminVerificationStatus: effectiveAdminStatus,
        adminStatus: effectiveAdminStatus,
        admin_status: effectiveAdminStatus,
        submissionStatus: submissionStage,
        submission_status: submissionStage,
        companyName: submission.companyName,
        companyAddress: submission.companyAddress,
        division: submission.division,
        startDate: submission.startDate,
        endDate: submission.endDate,
        createdAt: submission.createdAt,
        memberCount: acceptedMembers.length > 0 ? acceptedMembers.length : fallbackStudent ? 1 : 0,
      });
    }

    return items;
  }

  private async resolveFallbackStudentProfile(submissionId: string) {
    const docs = await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
    const uploader = docs.find((doc: any) => doc.uploadedByUser?.id)?.uploadedByUser;

    if (!uploader?.id) {
      return null;
    }

    const [user, mahasiswaProfile] = await Promise.all([
      this.userRepo.findById(uploader.id),
      this.userRepo.findMahasiswaByUserId(uploader.id),
    ]);

    return {
      nama: user?.nama ?? uploader.name ?? null,
      email: user?.email ?? uploader.email ?? null,
      phone: user?.phone ?? null,
      nim: mahasiswaProfile?.nim ?? null,
      prodi: mahasiswaProfile?.prodi ?? null,
      angkatan: mahasiswaProfile?.angkatan ?? null,
      semester: mahasiswaProfile?.semester ?? null,
    };
  }

  async approveRequest(requestId: string, userId: string, role: UserRole) {
    const verifier = await this.resolveSigningContext(userId, role);
    const submission = await this.submissionRepo.findByIdWithTeam(requestId);
    if (!submission) {
      const error: any = new Error('Pengajuan surat pengantar tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    await this.assertSubmissionReadyForDosen(submission, verifier);

    const signedPdfBuffer = await this.generateSignedPdf(submission, verifier);
    const upload = await this.storageService.uploadFile(
      signedPdfBuffer,
      `surat-pengantar-final-${submission.id}.pdf`,
      'surat-pengantar/final',
      'application/pdf'
    );

    const approvedAt = new Date();
    const currentHistory = Array.isArray(submission.statusHistory) ? submission.statusHistory : [];
    const statusHistory = [
      ...currentHistory,
      {
        status: 'APPROVED',
        workflowStage: 'COMPLETED',
        actor: 'DOSEN',
        date: approvedAt.toISOString(),
      },
    ];

    const updated = await this.submissionRepo.update(submission.id, {
      status: 'APPROVED',
      approvedAt,
      approvedBy: userId,
      workflowStage: 'COMPLETED',
      dosenVerificationStatus: 'APPROVED',
      dosenVerifiedAt: approvedAt,
      dosenVerifiedBy: userId,
      dosenRejectionReason: null,
      finalSignedFileUrl: upload.url,
      statusHistory,
      updatedAt: approvedAt,
    });

    if (!updated) {
      try {
        await this.storageService.deleteFile(upload.key);
      } catch {
        // best effort cleanup
      }

      const error: any = new Error('Gagal menyimpan hasil verifikasi dosen.');
      error.statusCode = 500;
      throw error;
    }

    await this.submissionRepo.addGeneratedLetter({
      id: generateId(),
      submissionId: submission.id,
      letterNumber: this.generateLetterNumber(),
      fileName: upload.key,
      fileUrl: upload.url,
      fileType: 'PDF',
      generatedBy: userId,
    });

    return {
      requestId: submission.id,
      submissionId: submission.id,
      status: 'DISETUJUI' as const,
      approvedAt,
      signedFileUrl: upload.url,
    };
  }

  async rejectRequest(requestId: string, userId: string, role: UserRole, rejectionReason: string) {
    const verifier = await this.resolveVerifierContext(userId, role);
    const submission = await this.submissionRepo.findByIdWithTeam(requestId);
    if (!submission) {
      const error: any = new Error('Pengajuan surat pengantar tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    await this.assertSubmissionReadyForDosen(submission, verifier);

    const rejectedAt = new Date();
    const currentHistory = Array.isArray(submission.statusHistory) ? submission.statusHistory : [];
    const statusHistory = [
      ...currentHistory,
      {
        status: 'REJECTED',
        workflowStage: 'REJECTED_DOSEN',
        actor: 'DOSEN',
        reason: rejectionReason,
        date: rejectedAt.toISOString(),
      },
    ];

    const updated = await this.submissionRepo.update(submission.id, {
      status: 'REJECTED',
      rejectionReason,
      approvedAt: null,
      approvedBy: userId,
      workflowStage: 'REJECTED_DOSEN',
      dosenVerificationStatus: 'REJECTED',
      dosenVerifiedAt: rejectedAt,
      dosenVerifiedBy: userId,
      dosenRejectionReason: rejectionReason,
      finalSignedFileUrl: null,
      statusHistory,
      updatedAt: rejectedAt,
    });

    if (!updated) {
      const error: any = new Error('Gagal menyimpan penolakan dosen.');
      error.statusCode = 500;
      throw error;
    }

    return {
      requestId: submission.id,
      submissionId: submission.id,
      status: 'DITOLAK' as const,
      rejectionReason,
      rejectedAt,
    };
  }

  private async resolveVerifierContext(userId: string, role: UserRole): Promise<VerifierContext> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      const error: any = new Error('Verifier tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    const dosenProfile = await this.userRepo.getDosenMe(userId);

    return {
      userId,
      role,
      nama: user.nama,
      nip: dosenProfile?.nip ?? null,
      jabatan: dosenProfile?.jabatan ?? null,
      prodi: dosenProfile?.prodi ?? null,
      esignatureUrl: dosenProfile?.esignatureUrl ?? null,
    };
  }

  private async resolveSigningContext(userId: string, role: UserRole): Promise<SigningContext> {
    const verifier = await this.resolveVerifierContext(userId, role);
    if (!verifier.esignatureUrl) {
      const error: any = new Error('E-signature dosen belum tersedia.');
      error.statusCode = 422;
      throw error;
    }

    const response = await fetch(verifier.esignatureUrl);
    if (!response.ok) {
      const error: any = new Error('Gagal mengambil file e-signature dosen.');
      error.statusCode = 502;
      throw error;
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    return {
      ...verifier,
      signatureImageBuffer: Buffer.from(await response.arrayBuffer()),
      signatureMimeType: contentType,
    };
  }

  private async assertSubmissionReadyForDosen(submission: any, verifier: VerifierContext) {
    const isNormalQueue = submission.workflowStage === 'PENDING_DOSEN_VERIFICATION';
    const effectiveAdminStatus = this.getEffectiveAdminStatus(submission);
    const isLegacyQueue =
      submission.status === 'APPROVED' &&
      effectiveAdminStatus === 'APPROVED' &&
      submission.dosenVerificationStatus !== 'APPROVED' &&
      submission.workflowStage !== 'COMPLETED' &&
      !submission.finalSignedFileUrl;

    if (!isNormalQueue && !isLegacyQueue) {
      const error: any = new Error('Submission belum berada pada tahap verifikasi dosen.');
      error.statusCode = 409;
      throw error;
    }

    if (effectiveAdminStatus !== 'APPROVED') {
      const error: any = new Error('Submission belum disetujui admin.');
      error.statusCode = 409;
      throw error;
    }

    const allowed = await this.canVerifierAccessSubmission(verifier, submission.team?.leaderId ?? submission.team?.leader?.id);
    if (!allowed) {
      const error: any = new Error('Anda tidak berhak memverifikasi submission ini.');
      error.statusCode = 403;
      throw error;
    }
  }

  private isAcademicViceDean(verifier: VerifierContext): boolean {
    const jabatan = (verifier.jabatan ?? '').trim().toLowerCase();
    return jabatan.includes('wakil dekan') && jabatan.includes('akademik');
  }

  private async canVerifierAccessSubmission(verifier: VerifierContext, leaderUserId: string | null | undefined) {
    // Full access for WAKIL_DEKAN role or dosen with jabatan "Wakil Dekan Bidang Akademik"
    if (verifier.role === 'WAKIL_DEKAN' || this.isAcademicViceDean(verifier)) {
      return true;
    }

    // Prodi-based access for regular dosen
    if (!leaderUserId || !verifier.prodi) {
      return false;
    }

    const leaderProfile = await this.userRepo.findMahasiswaByUserId(leaderUserId);
    if (!leaderProfile?.prodi) {
      return false;
    }

    return verifier.prodi === leaderProfile.prodi;
  }

  private async generateSignedPdf(submission: any, verifier: SigningContext) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let signatureImage;
    if (verifier.signatureMimeType.includes('jpeg') || verifier.signatureMimeType.includes('jpg')) {
      signatureImage = await pdfDoc.embedJpg(verifier.signatureImageBuffer);
    } else {
      signatureImage = await pdfDoc.embedPng(verifier.signatureImageBuffer);
    }

    const teamMembers = Array.isArray(submission.team?.members) ? submission.team.members : [];
    const acceptedMembers = teamMembers.filter((member: any) => member.status === 'ACCEPTED');
    const memberLines = acceptedMembers.length > 0
      ? acceptedMembers.map((member: any, index: number) => `${index + 1}. ${member.user?.name ?? '-'} (${member.user?.nim ?? '-'})`)
      : ['1. Data anggota tim tidak tersedia'];

    page.drawText('SURAT PENGANTAR KERJA PRAKTIK', {
      x: 130,
      y: 790,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    const lines = [
      `Nomor: ${this.generateLetterNumber()}`,
      `Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
      '',
      `Kepada Yth.`,
      `${submission.companyName}`,
      `${submission.companyAddress}`,
      '',
      'Dengan hormat,',
      'Melalui surat ini kami menerangkan bahwa mahasiswa berikut mengajukan kerja praktik',
      'pada instansi/perusahaan yang dituju:',
      '',
      ...memberLines,
      '',
      `Divisi/Bagian: ${submission.division ?? '-'}`,
      `Periode: ${submission.startDate ?? '-'} s/d ${submission.endDate ?? '-'}`,
      '',
      'Submission ini telah diverifikasi admin dan disetujui untuk diterbitkan sebagai surat pengantar final.',
      '',
      'Demikian surat pengantar ini dibuat untuk dipergunakan sebagaimana mestinya.',
    ];

    let cursorY = 755;
    for (const line of lines) {
      page.drawText(line, {
        x: 55,
        y: cursorY,
        size: 11,
        font,
        color: rgb(0, 0, 0),
      });
      cursorY -= line === '' ? 10 : 16;
    }

    page.drawText('Mengetahui,', {
      x: 380,
      y: 190,
      size: 11,
      font,
    });

    page.drawImage(signatureImage, {
      x: 375,
      y: 95,
      width: 120,
      height: 60,
    });

    page.drawText(verifier.nama ?? 'Dosen Verifikator', {
      x: 375,
      y: 80,
      size: 11,
      font: boldFont,
    });

    page.drawText(verifier.jabatan ?? 'Dosen', {
      x: 375,
      y: 64,
      size: 10,
      font,
    });

    if (verifier.nip) {
      page.drawText(`NIP. ${verifier.nip}`, {
        x: 375,
        y: 50,
        size: 10,
        font,
      });
    }

    return Buffer.from(await pdfDoc.save());
  }

  private generateLetterNumber() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const serial = String(Math.floor(Math.random() * 9000) + 1000);
    return `${serial}/KP/FT/${month}/${year}`;
  }

  private getEffectiveAdminStatus(submission: any): 'PENDING' | 'APPROVED' | 'REJECTED' {
    if (submission.adminVerificationStatus === 'APPROVED' || submission.adminVerificationStatus === 'REJECTED') {
      return submission.adminVerificationStatus;
    }

    // Legacy compatibility: some old records only have status=APPROVED/REJECTED without admin_verification_status populated.
    if (submission.status === 'APPROVED') {
      return 'APPROVED';
    }

    if (submission.status === 'REJECTED') {
      return 'REJECTED';
    }

    return 'PENDING';
  }
}