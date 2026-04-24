import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { UserRepository } from '@/repositories/user.repository';
import { StorageService } from '@/services/storage.service';
import { UNSRI_LOGO_BASE64 } from '@/constants/unsri-logo.base64';
import { generateId } from '@/utils/helpers';
import type { RbacRole } from '@/types';

type VerifierContext = {
  userId: string;
  role: RbacRole;
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

type VerifierSubmission = {
  id: string;
  teamId: string;
  workflowStage?: string | null;
  adminVerificationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  dosenVerificationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  dosenVerifiedAt?: Date | string | null;
  dosenVerifiedBy?: string | null;
  finalSignedFileUrl?: string | null;
  final_signed_file_url?: string | null;
  archivedAt?: Date | string | null;
  status?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  division?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  submittedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  letterPurpose?: string | null;
  letterNumber?: string | null;
  nomorSurat?: string | null;
  statusHistory?: unknown;
  tujuanSurat?: string | null;
  tujuan_surat?: string | null;
  team?: {
    leaderId?: string | null;
    leader?: { id?: string | null } | null;
    academicSupervisor?: string | null;
    members?: Array<{ status?: string | null; user?: { name?: string | null; nim?: string | null; prodi?: string | null } }>;
  } | null;
};

type SubmissionDocumentLike = {
  documentType?: string | null;
  fileUrl?: string | null;
  createdAt?: Date | string | null;
  uploadedByUser?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
};

type GeneratedLetterLike = {
  generatedAt?: Date | string | null;
  fileUrl?: string | null;
};

export class SuratPengantarDosenService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private teamRepo: TeamRepository,
    private userRepo: UserRepository,
    private storageService: StorageService
  ) {}

  async getRequestsForVerifier(userId: string, role: RbacRole) {
    const verifier = await this.resolveVerifierContext(userId, role);
    const allSubmissions = await this.submissionRepo.findAll();
    const submissions = (allSubmissions as VerifierSubmission[]).filter((submission) => {
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
      queueCandidates: submissions.map((s) => ({
        id: s.id,
        workflowStage: s.workflowStage,
        adminVerificationStatus: s.adminVerificationStatus,
        dosenVerificationStatus: s.dosenVerificationStatus,
      })),
    });

    const items: Array<Record<string, unknown>> = [];

    for (const submission of submissions) {
      const team = await this.teamRepo.findById(submission.teamId);
      const signedFileUrl = await this.resolveFinalSignedFileUrl(submission);
      const approvedAt = this.resolveApprovedAt(submission);

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
        approvedAt,
        approved_at: approvedAt,
        signedFileUrl,
        signed_file_url: signedFileUrl,
        letterNumber: submission.letterNumber,
      });
    }

    return items;
  }

  private async resolveFallbackStudentProfile(submissionId: string) {
    const docs = await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
    const uploader = (docs as SubmissionDocumentLike[]).find((doc) => doc.uploadedByUser?.id)?.uploadedByUser;

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

  async approveRequest(requestId: string, userId: string, role: RbacRole) {
    const verifier = await this.resolveVerifierContext(userId, role);
    const submission = await this.submissionRepo.findByIdWithTeam(requestId);
    if (!submission) {
      const error: Error = new Error('Pengajuan surat pengantar tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    await this.assertSubmissionReadyForDosen(submission, verifier);
    let signedFileUrl =
      submission?.finalSignedFileUrl ??
      null;

    // Hybrid mode:
    // 1) Reuse existing final URL if available.
    // 2) Generate and upload signed PDF only when URL is missing.
    if (!signedFileUrl) {
      const signingVerifier = await this.resolveSigningContext(userId, role);
      const signedPdfBuffer = await this.generateSignedPdf(submission, signingVerifier);
      const upload = await this.storageService.uploadFile(
        signedPdfBuffer,
        `surat-pengantar-final-${submission.id}.pdf`,
        'surat-pengantar/final',
        'application/pdf'
      );

      signedFileUrl = upload.url;

      await this.submissionRepo.addGeneratedLetter({
        id: generateId(),
        submissionId: submission.id,
        letterNumber: this.generateLetterNumber(),
        fileName: upload.key,
        fileUrl: upload.url,
        fileType: 'PDF',
        generatedBy: userId,
      });
    }

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
      finalSignedFileUrl: signedFileUrl,
      statusHistory,
      updatedAt: approvedAt,
    });

    if (!updated) {
      const error: Error = new Error('Gagal menyimpan hasil verifikasi dosen.');
      error.statusCode = 500;
      throw error;
    }

    return {
      requestId: submission.id,
      submissionId: submission.id,
      status: 'approved' as const,
      approvedAt: approvedAt.toISOString(),
      approved_at: approvedAt.toISOString(),
      signedFileUrl,
      signed_file_url: signedFileUrl,
    };
  }

  async rejectRequest(requestId: string, userId: string, role: RbacRole, rejectionReason: string) {
    const verifier = await this.resolveVerifierContext(userId, role);
    const submission = await this.submissionRepo.findByIdWithTeam(requestId);
    if (!submission) {
      const error: Error = new Error('Pengajuan surat pengantar tidak ditemukan.');
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
      const error: Error = new Error('Gagal menyimpan penolakan dosen.');
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

  private async resolveVerifierContext(userId: string, role: RbacRole): Promise<VerifierContext> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      const error: Error = new Error('Verifier tidak ditemukan.');
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

  private async resolveSigningContext(userId: string, role: RbacRole): Promise<SigningContext> {
    const verifier = await this.resolveVerifierContext(userId, role);
    if (!verifier.esignatureUrl) {
      const error: Error = new Error('E-signature dosen belum tersedia.');
      error.statusCode = 422;
      throw error;
    }

    const response = await fetch(verifier.esignatureUrl);
    if (!response.ok) {
      const error: Error = new Error('Gagal mengambil file e-signature dosen.');
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

  private async assertSubmissionReadyForDosen(submission: VerifierSubmission, verifier: VerifierContext) {
    const isNormalQueue = submission.workflowStage === 'PENDING_DOSEN_VERIFICATION';
    const effectiveAdminStatus = this.getEffectiveAdminStatus(submission);
    const isLegacyQueue =
      submission.status === 'APPROVED' &&
      effectiveAdminStatus === 'APPROVED' &&
      submission.dosenVerificationStatus !== 'APPROVED' &&
      submission.workflowStage !== 'COMPLETED' &&
      !submission.finalSignedFileUrl;

    if (!isNormalQueue && !isLegacyQueue) {
      const error: Error = new Error('Submission belum berada pada tahap verifikasi dosen.');
      error.statusCode = 409;
      throw error;
    }

    if (effectiveAdminStatus !== 'APPROVED') {
      const error: Error = new Error('Submission belum disetujui admin.');
      error.statusCode = 409;
      throw error;
    }

    const allowed = await this.canVerifierAccessSubmission(verifier, submission.team?.leaderId ?? submission.team?.leader?.id);
    if (!allowed) {
      const error: Error = new Error('Anda tidak berhak memverifikasi submission ini.');
      error.statusCode = 403;
      throw error;
    }
  }

  private isAcademicViceDean(verifier: VerifierContext): boolean {
    const jabatan = (verifier.jabatan ?? '').trim().toLowerCase();
    return jabatan.includes('wakil dekan') && jabatan.includes('akademik');
  }

  private async resolveFinalSignedFileUrl(submission: VerifierSubmission): Promise<string | null> {
    const directUrl =
      submission?.finalSignedFileUrl ??
      submission?.final_signed_file_url ??
      null;

    if (directUrl) {
      return directUrl;
    }

    // Fallback 1: surat pengantar file attached in submission documents.
    // Some legacy rows store final file only in submission_documents.
    const documents = await this.submissionRepo.findDocumentsBySubmissionId(submission.id);
    const latestSuratPengantarDoc = (documents as SubmissionDocumentLike[])
      .filter((doc) => doc.documentType === 'SURAT_PENGANTAR' && !!doc.fileUrl)
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })[0];

    if (latestSuratPengantarDoc?.fileUrl) {
      return latestSuratPengantarDoc.fileUrl;
    }

    // Fallback 2: generated letters table.
    const letters = await this.submissionRepo.findLettersBySubmissionId(submission.id);
    if (!letters.length) {
      return null;
    }

    const latestLetter = (letters as GeneratedLetterLike[])
      .slice()
      .sort((a, b) => {
        const aTime = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
        const bTime = b.generatedAt ? new Date(b.generatedAt).getTime() : 0;
        return bTime - aTime;
      })[0];

    return latestLetter?.fileUrl ?? null;
  }

  private resolveApprovedAt(submission: VerifierSubmission): string | null {
    const approvedAt = submission?.dosenVerifiedAt ?? submission?.approvedAt ?? null;
    if (!approvedAt) {
      return null;
    }

    const date = approvedAt instanceof Date ? approvedAt : new Date(approvedAt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  }

  private async canVerifierAccessSubmission(verifier: VerifierContext, leaderUserId: string | null | undefined) {
    // Full access for WAKIL_DEKAN role or dosen with jabatan "Wakil Dekan Bidang Akademik"
    if (verifier.role === 'wakil_dekan' || this.isAcademicViceDean(verifier)) {
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

  private async generateSignedPdf(submission: VerifierSubmission, verifier: SigningContext) {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const italicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

    const pageHeight = 841.89;
    const mm = (value: number) => value * 2.834645669;
    const state = { yMm: 20 };
    const leftMm = 20;
    const rightMm = 190;
    const lineHeightMm = 4.5;

    const toX = (xMm: number) => mm(xMm);
    const toY = (yMm: number) => pageHeight - mm(yMm);
    const toImageY = (topMm: number, heightMm: number) => pageHeight - mm(topMm + heightMm);

    const draw = (
      text: string,
      xMm: number,
      options?: {
        yMm?: number;
        size?: number;
        fontStyle?: 'normal' | 'bold' | 'italic';
        center?: boolean;
        right?: boolean;
        color?: ReturnType<typeof rgb>;
      }
    ) => {
      const yMm = options?.yMm ?? state.yMm;
      const size = options?.size ?? 12;
      const selectedFont =
        options?.fontStyle === 'bold' ? boldFont : options?.fontStyle === 'italic' ? italicFont : font;
      const color = options?.color ?? rgb(0, 0, 0);

      let x = toX(xMm);
      const textWidth = selectedFont.widthOfTextAtSize(text, size);
      if (options?.center) {
        x = toX((leftMm + rightMm) / 2) - textWidth / 2;
      }
      if (options?.right) {
        x = toX(xMm) - textWidth;
      }

      page.drawText(text, {
        x,
        y: toY(yMm),
        size,
        font: selectedFont,
        color,
      });
    };

    const splitLines = (
      text: string,
      widthMm: number,
      options?: { size?: number; fontStyle?: 'normal' | 'bold' | 'italic' }
    ) => {
      const size = options?.size ?? 12;
      const selectedFont =
        options?.fontStyle === 'bold' ? boldFont : options?.fontStyle === 'italic' ? italicFont : font;
      const widthPt = mm(widthMm);
      const words = this.sanitizeText(text || '').split(' ').filter(Boolean);
      if (!words.length) return [''];

      const lines: string[] = [];
      let current = words[0];

      for (let i = 1; i < words.length; i += 1) {
        const candidate = `${current} ${words[i]}`;
        if (selectedFont.widthOfTextAtSize(candidate, size) <= widthPt) {
          current = candidate;
        } else {
          lines.push(current);
          current = words[i];
        }
      }

      lines.push(current);
      return lines;
    };

    const ensureSpace = (requiredMm: number) => {
      if (state.yMm + requiredMm <= 275) return;
      page = pdfDoc.addPage([595.28, 841.89]);
      state.yMm = 20;
    };

    const writeJustifiedParagraph = (
      text: string,
      xMm: number,
      widthMm: number,
      lineHeight = lineHeightMm
    ) => {
      const lines = splitLines(text, widthMm, { size: 12, fontStyle: 'normal' });
      const widthPt = mm(widthMm);

      lines.forEach((line, index) => {
        const value = line.trim();
        const isLastLine = index === lines.length - 1;
        const words = value.split(/\s+/).filter(Boolean);

        if (!isLastLine && words.length > 1) {
          const wordsWidth = words.reduce(
            (total, word) => total + font.widthOfTextAtSize(word, 12),
            0
          );
          const extraSpace = (widthPt - wordsWidth) / (words.length - 1);

          let cursorPt = toX(xMm);
          words.forEach((word, wordIndex) => {
            page.drawText(word, {
              x: cursorPt,
              y: toY(state.yMm),
              size: 12,
              font,
              color: rgb(0, 0, 0),
            });

            if (wordIndex < words.length - 1) {
              cursorPt += font.widthOfTextAtSize(word, 12) + extraSpace;
            }
          });
        } else {
          draw(value, xMm);
        }

        state.yMm += lineHeight;
      });
    };

    const writeParagraphWithBoldToken = (
      fullText: string,
      boldToken: string,
      xMm: number,
      widthMm: number,
      lineHeight = lineHeightMm
    ) => {
      const marker = '__BOLD_TOKEN__';
      const normalized = fullText.includes(boldToken)
        ? fullText.replace(boldToken, marker)
        : fullText;

      const segments = normalized
        .split(marker)
        .flatMap((part, index, arr) => {
          const out: Array<{ text: string; bold: boolean }> = [];
          if (part.trim().length > 0) out.push({ text: part, bold: false });
          if (index < arr.length - 1 && boldToken.trim().length > 0) {
            out.push({ text: boldToken, bold: true });
          }
          return out;
        });

      const chunks: Array<{ text: string; bold: boolean }> = [];
      segments.forEach((segment) => {
        if (segment.bold) {
          chunks.push({ text: segment.text, bold: true });
          return;
        }
        segment.text
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .forEach((word) => chunks.push({ text: word, bold: false }));
      });

      const lines: Array<Array<{ text: string; bold: boolean }>> = [];
      let currentLine: Array<{ text: string; bold: boolean }> = [];
      let currentWidth = 0;
      const widthPt = mm(widthMm);

      chunks.forEach((item) => {
        const selectedFont = item.bold ? boldFont : font;
        const wordWidth = selectedFont.widthOfTextAtSize(item.text, 12);
        const spaceWidth = font.widthOfTextAtSize(' ', 12);
        const candidate = currentLine.length === 0 ? wordWidth : currentWidth + spaceWidth + wordWidth;

        if (candidate > widthPt && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = [item];
          currentWidth = wordWidth;
        } else {
          currentLine.push(item);
          currentWidth = candidate;
        }
      });

      if (currentLine.length > 0) lines.push(currentLine);

      lines.forEach((line) => {
        let cursorPt = toX(xMm);
        line.forEach((item, index) => {
          const selectedFont = item.bold ? boldFont : font;
          page.drawText(item.text, {
            x: cursorPt,
            y: toY(state.yMm),
            size: 12,
            font: selectedFont,
            color: rgb(0, 0, 0),
          });

          const textWidth = selectedFont.widthOfTextAtSize(item.text, 12);
          if (index < line.length - 1) {
            cursorPt += textWidth + font.widthOfTextAtSize(' ', 12);
          }
        });
        state.yMm += lineHeight;
      });
    };

    const drawStampPlaceholder = (xMm: number, yMm: number, sizeMm: number) => {
      const cx = xMm + sizeMm / 2;
      const cy = yMm + sizeMm / 2;
      page.drawCircle({
        x: toX(cx),
        y: toY(cy),
        size: mm(sizeMm / 2),
        borderWidth: 0.9,
        borderColor: rgb(0.1, 0.25, 0.69),
      });
      page.drawCircle({
        x: toX(cx),
        y: toY(cy),
        size: mm(sizeMm / 2 - 3),
        borderWidth: 0.9,
        borderColor: rgb(0.1, 0.25, 0.69),
      });

      draw('STEMPEL', cx, {
        yMm: cy - 1,
        size: 8,
        fontStyle: 'bold',
        center: true,
        color: rgb(0.1, 0.25, 0.69),
      });
      draw('PLACEHOLDER', cx, {
        yMm: cy + 4,
        size: 8,
        fontStyle: 'bold',
        center: true,
        color: rgb(0.1, 0.25, 0.69),
      });
    };

    const drawLogoFallback = (xMm: number, yMm: number, sizeMm: number) => {
      const centerX = xMm + sizeMm / 2;
      const centerY = yMm + sizeMm / 2;

      page.drawCircle({
        x: toX(centerX),
        y: toY(centerY),
        size: mm(sizeMm / 2),
        borderWidth: 0.6,
        borderColor: rgb(0.12, 0.23, 0.54),
      });

      page.drawCircle({
        x: toX(centerX),
        y: toY(centerY),
        size: mm(sizeMm / 2 - 1.6),
        borderWidth: 0,
        color: rgb(1, 1, 1),
      });

      draw('UNSRI', centerX, {
        yMm: centerY + 1.8,
        size: 7,
        fontStyle: 'bold',
        center: true,
      });
    };

    const teamMembers = Array.isArray(submission.team?.members) ? submission.team.members : [];
    const acceptedMembers = teamMembers.filter((member) => member.status === 'ACCEPTED');
    const displayMembers = acceptedMembers.length
      ? acceptedMembers
      : [{ user: { name: 'Data mahasiswa tidak tersedia', nim: '-', prodi: '-' }, status: 'ACCEPTED' }];

    const recipient = this.buildRecipientLine(submission);
    const address = this.sanitizeText(submission.companyAddress) || '-';
    const approvedDateRaw = submission?.approvedAt ?? submission?.submittedAt ?? submission?.createdAt;
    const tanggalSurat = this.formatDateLong(approvedDateRaw);
    const dosenPembimbing = this.sanitizeText(submission?.team?.academicSupervisor) || verifier.nama || '-';

    // Draw UNSRI logo from embedded frontend asset; fallback to vector placeholder.
    try {
      const logoBytes = Buffer.from(UNSRI_LOGO_BASE64, 'base64');
      const logoImage = await pdfDoc.embedPng(logoBytes);
      page.drawImage(logoImage, {
        x: toX(12),
        y: toImageY(14, 36),
        width: mm(36),
        height: mm(36),
      });
    } catch {
      drawLogoFallback(12, 14, 36);
    }

    // Header
    draw('KEMENTERIAN PENDIDIKAN TINGGI,', 0, { center: true, size: 16 });
    state.yMm += 6;
    draw('SAINS, DAN TEKNOLOGI', 0, { center: true, size: 16 });
    state.yMm += 7;
    draw('UNIVERSITAS SRIWIJAYA', 0, { center: true, size: 14 });
    state.yMm += 5;
    draw('FAKULTAS ILMU KOMPUTER', 0, { center: true, size: 14, fontStyle: 'bold' });
    state.yMm += 7;
    draw('Jalan Palembang - Prabumulih Km. 32 Inderalaya Ogan Ilir Kode Pos 30662', 0, { center: true, size: 11 });
    state.yMm += 5;
    draw('Telepon (+62711) 379249. Pos-el humas@ilkom.unsri.ac.id', 0, { center: true, size: 11 });
    state.yMm += 5;
    page.drawLine({
      start: { x: toX(leftMm), y: toY(state.yMm) },
      end: { x: toX(rightMm), y: toY(state.yMm) },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
    state.yMm += 10;


    // --- NOMOR SURAT ---
    const nomorSurat = submission.letterNumber || submission.nomorSurat || '-';

    // Metadata
    const contentLeft = leftMm + 10;
    const contentRight = rightMm - 10;
    const contentWidth = contentRight - contentLeft;

    draw('Nomor', contentLeft, { size: 12 });
    draw(':', contentLeft + 22, { size: 12 });
    draw(nomorSurat, contentLeft + 26, { size: 12 });
    draw(tanggalSurat, contentRight, { size: 12, right: true });
    state.yMm += lineHeightMm;

    draw('Lampiran', contentLeft, { size: 12 });
    draw(':', contentLeft + 22, { size: 12 });
    draw('1 (satu) berkas', contentLeft + 26, { size: 12 });
    state.yMm += lineHeightMm;

    draw('Perihal', contentLeft, { size: 12 });
    draw(':', contentLeft + 22, { size: 12 });
    draw('Izin Kerja Praktik', contentLeft + 26, { size: 12 });
    state.yMm += lineHeightMm * 2;

    // Recipient
    draw('Yth.', contentLeft, { size: 12, fontStyle: 'bold' });
    const recipientLabelX = contentLeft;
    const recipientValueX = contentLeft + 20;
    const recipientWidth = contentWidth - (recipientValueX - recipientLabelX);
    splitLines(recipient, recipientWidth, { size: 12, fontStyle: 'bold' }).forEach((line, idx) => {
      draw(line, recipientValueX, { yMm: state.yMm + idx * lineHeightMm, size: 12, fontStyle: 'bold' });
    });
    state.yMm += Math.max(1, splitLines(recipient, recipientWidth).length) * lineHeightMm;

    splitLines(address, recipientWidth, { size: 12, fontStyle: 'bold' }).forEach((line, idx) => {
      draw(line, recipientValueX, { yMm: state.yMm + idx * lineHeightMm, size: 12, fontStyle: 'bold' });
    });
    state.yMm += Math.max(1, splitLines(address, recipientWidth).length) * lineHeightMm;

    draw('di', recipientValueX, { size: 12, fontStyle: 'bold' });
    state.yMm += lineHeightMm;
    draw('Tempat', recipientValueX + 12, { size: 12 });
    state.yMm += lineHeightMm * 3;

    // Opening paragraph
    const openingText =
      'Dengan hormat, kami sampaikan bahwa salah satu syarat mahasiswa Fakultas Ilmu Komputer Universitas Sriwijaya untuk menyelesaikan pendidikannya adalah melakukan Kerja Praktik (KP). Kerja Praktik ini bertujuan untuk memberikan pengalaman kerja sesuai kompetensi atau program studi mahasiswa berkaitan Teknologi Informasi dan Komunikasi (TIK). Berkenaan hal tersebut, mahasiswa berikut ini :';
    writeJustifiedParagraph(openingText, contentLeft, contentWidth, lineHeightMm);
    state.yMm += 3;

    // Student blocks
    const numX = contentLeft + 2;
    const labelX = contentLeft + 18;
    const colonX = contentLeft + 63;
    const valueX = contentLeft + 67;
    const valueWidth = contentRight - valueX - 2;

    for (let index = 0; index < displayMembers.length; index += 1) {
      const member = displayMembers[index] as { user?: { name?: string | null; nim?: string | null; prodi?: string | null } };
      ensureSpace(40);
      draw(`${index + 1}.`, numX, { size: 12 });

      const writeField = (label: string, value: string) => {
        draw(label, labelX, { size: 12 });
        draw(':', colonX, { size: 12 });
        const lines = splitLines(value || '-', valueWidth, { size: 12 });
        lines.forEach((line, idx) => {
          draw(line, valueX, { yMm: state.yMm + idx * lineHeightMm, size: 12 });
        });
        state.yMm += Math.max(1, lines.length) * lineHeightMm;
      };

      writeField('Nama', this.sanitizeText(member.user?.name) || '-');
      writeField('NIM', this.sanitizeText(member.user?.nim) || '-');
      writeField('Program Studi', this.sanitizeText(member.user?.prodi) || '-');
      writeField('Dosen Pembimbing', dosenPembimbing);
      state.yMm += lineHeightMm * 0.65;
    }

    const periodText = `${this.formatDateLong(submission.startDate)} - ${this.formatDateLong(submission.endDate)}`;
    const penutupText =
      `Merencanakan Kerja Praktik (KP) di unit/bagian/subbagian ${submission.division || '-'} yang Bapak/Ibu pimpin pada tanggal ${periodText} dengan proposal KP terlampir. Mohon kiranya Bapak/Ibu dapat memperkenankan/memfasilitasi mahasiswa tersebut.`;
    ensureSpace(65);
    writeParagraphWithBoldToken(penutupText, periodText, contentLeft, contentWidth, lineHeightMm);
    state.yMm += 8;
    writeJustifiedParagraph('Atas perkenan dan bantuannya, kami mengucapkan terima kasih.', contentLeft, contentWidth, lineHeightMm);
    state.yMm += 8;

    // Signature block
    const signX = contentRight - 53;
    draw('Wakil Dekan Bidang Akademik,', signX, { size: 12 });
    const signatureTopY = state.yMm + 4;
    state.yMm += 28;

    let hasRenderedSignature = false;
    try {
      let signatureImage;
      if (verifier.signatureMimeType.includes('jpeg') || verifier.signatureMimeType.includes('jpg')) {
        signatureImage = await pdfDoc.embedJpg(verifier.signatureImageBuffer);
      } else {
        signatureImage = await pdfDoc.embedPng(verifier.signatureImageBuffer);
      }

      page.drawImage(signatureImage, {
        x: toX(signX - 8),
        y: toImageY(signatureTopY, 20),
        width: mm(55),
        height: mm(20),
      });
      hasRenderedSignature = true;
    } catch {
      hasRenderedSignature = false;
    }

    if (!hasRenderedSignature) {
      draw('[Tanda Tangan Digital]', signX, {
        yMm: signatureTopY + 13,
        size: 12,
        fontStyle: 'italic',
      });
    }

    drawStampPlaceholder(84, signatureTopY - 25, 56);

    draw(verifier.nama ?? '-', signX, { size: 12 });
    state.yMm += 7;
    draw(`NIP ${verifier.nip ?? '-'}`, signX, { size: 12 });

    return Buffer.from(await pdfDoc.save());
  }

  private buildRecipientLine(submission: VerifierSubmission): string {
    const tujuan = this.sanitizeText(
      submission?.tujuanSurat ??
      submission?.tujuan_surat ??
      submission?.letterPurpose
    );
    const company = this.sanitizeText(submission?.companyName);

    if (tujuan && company) {
      if (tujuan.toLowerCase().includes(company.toLowerCase())) {
        return tujuan;
      }
      return `${tujuan} ${company}`;
    }

    return tujuan || company || '-';
  }

  private sanitizeText(value: unknown): string {
    if (value == null) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  private formatDateLong(dateValue: unknown): string {
    if (!dateValue) return '-';

    const months = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ];

    const normalized = String(dateValue).trim();
    const localMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

    let date: Date;
    if (localMatch) {
      const [, dd, mm, yyyy] = localMatch;
      date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    } else {
      date = new Date(normalized);
    }

    if (Number.isNaN(date.getTime())) {
      return normalized;
    }

    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  private generateLetterNumber() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const serial = String(Math.floor(Math.random() * 9000) + 1000);
    return `${serial}/KP/FT/${month}/${year}`;
  }

  private getEffectiveAdminStatus(submission: VerifierSubmission): 'PENDING' | 'APPROVED' | 'REJECTED' {
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