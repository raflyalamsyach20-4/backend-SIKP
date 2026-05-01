import { SubmissionRepository } from '@/repositories/submission.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { SuratKesediaanRepository } from '@/repositories/surat-kesediaan.repository';
import { SuratPermohonanRepository } from '@/repositories/surat-permohonan.repository';
import { StorageService } from './storage.service';
import { generateId } from '@/utils/helpers';
import { createDbClient } from '@/db';

type LetterDocumentType = 'SURAT_KESEDIAAN' | 'FORM_PERMOHONAN';
type LetterRequestStatus = 'MENUNGGU' | 'DISETUJUI' | 'DITOLAK' | null;

export class SubmissionService {
  private submissionRepo: SubmissionRepository;
  private teamRepo: TeamRepository;
  private suratKesediaanRepo: SuratKesediaanRepository;
  private suratPermohonanRepo: SuratPermohonanRepository;
  private storageService?: StorageService;

  constructor(
    private env: CloudflareBindings
  ) {
    const db = createDbClient(env.DATABASE_URL);
    this.submissionRepo = new SubmissionRepository(db);
    this.teamRepo = new TeamRepository(db);
    this.suratKesediaanRepo = new SuratKesediaanRepository(db);
    this.suratPermohonanRepo = new SuratPermohonanRepository(db);
    this.storageService = new StorageService(env);
  }

  private createServiceError(message: string, code: string, statusCode: number) {
    const error = new Error(message) as Error & { code: string; statusCode: number };
    error.code = code;
    error.statusCode = statusCode;
    return error;
  }

  private buildDefaultDraftPayload(teamCode: string) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    return {
      letterPurpose: `Belum diisi`,
      companyName: 'Belum diisi',
      companyAddress: 'Belum diisi',
      companyPhone: null,
      companyBusinessType: null,
      division: 'Belum diisi',
      startDate: today,
      endDate: today,
    };
  }

  private toStudentSubmissionView<T extends Record<string, unknown>>(submission: T): T & {
    status: string;
    legacyStatus: string;
    submissionStatus: string;
    submission_status: string;
    adminStatus: string;
    admin_status: string;
    isAdminApproved: boolean;
    finalSignedFileUrl: string | null;
  } {
    const legacyStatus = String(submission.status ?? 'DRAFT');
    const rawWorkflowStage = submission.workflowStage ?? (legacyStatus === 'PENDING_REVIEW' ? 'PENDING_ADMIN_REVIEW' : legacyStatus);
    const adminVerificationStatus =
      submission.adminVerificationStatus === 'APPROVED' || submission.adminVerificationStatus === 'REJECTED'
        ? submission.adminVerificationStatus
        : legacyStatus === 'APPROVED'
          ? 'APPROVED'
          : legacyStatus === 'REJECTED'
            ? 'REJECTED'
            : 'PENDING';
    const workflowStage =
      rawWorkflowStage === 'DRAFT' && adminVerificationStatus === 'APPROVED'
        ? 'PENDING_DOSEN_VERIFICATION'
        : rawWorkflowStage === 'DRAFT' && adminVerificationStatus === 'REJECTED'
          ? 'REJECTED_ADMIN'
          : rawWorkflowStage;
    const dosenVerificationStatus = submission.dosenVerificationStatus ?? 'PENDING';
    const canSeeFinalLetter = workflowStage === 'COMPLETED'
      && dosenVerificationStatus === 'APPROVED'
      && Boolean(submission.finalSignedFileUrl);

    return {
      ...submission,
      status: String(workflowStage),
      legacyStatus,
      submissionStatus: String(workflowStage),
      submission_status: String(workflowStage),
      adminStatus: adminVerificationStatus,
      admin_status: adminVerificationStatus,
      isAdminApproved: adminVerificationStatus === 'APPROVED',
      finalSignedFileUrl:
        canSeeFinalLetter && typeof submission.finalSignedFileUrl === 'string'
          ? submission.finalSignedFileUrl
          : null,
    };
  }

  async ensureDraftSubmissionForTeam(teamId: string, mahasiswaId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw this.createServiceError('Team not found', 'TEAM_NOT_FOUND', 404);
    }

    if (team.status !== 'FIXED') {
      throw this.createServiceError(
        'Upload dokumen gagal. Tetapkan tim terlebih dahulu.',
        'TEAM_NOT_FIXED',
        400
      );
    }

    const membership = await this.teamRepo.findMemberByTeamAndMahasiswa(teamId, mahasiswaId);
    if (!membership || membership.invitationStatus !== 'ACCEPTED') {
      throw this.createServiceError('Forbidden', 'FORBIDDEN', 403);
    }

    const existingSubmissions = await this.submissionRepo.findByTeamId(teamId);
    if (existingSubmissions.length > 0) {
      return {
        submission: existingSubmissions[0],
        alreadyExists: true,
      };
    }

    const defaults = this.buildDefaultDraftPayload(team.code);
    let submission;
    try {
      submission = await this.submissionRepo.create({
        id: generateId(),
        teamId,
        status: 'DRAFT',
        workflowStage: 'DRAFT',
        adminVerificationStatus: 'PENDING',
        dosenVerificationStatus: 'PENDING',
        ...defaults,
      });
    } catch {
      const racedSubmissions = await this.submissionRepo.findByTeamId(teamId);
      if (racedSubmissions.length > 0) {
        return {
          submission: racedSubmissions[0],
          alreadyExists: true,
        };
      }
      throw this.createServiceError('Failed to create submission', 'INTERNAL_ERROR', 500);
    }

    return {
      submission,
      alreadyExists: false,
    };
  }

  async createSubmission(
    teamId: string, 
    mahasiswaId: string,
    data: {
      letterPurpose?: string;
      companyName?: string;
      companyAddress?: string;
      companyPhone?: string;
      companyBusinessType?: string;
      division?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw this.createServiceError('Team not found', 'TEAM_NOT_FOUND', 404);
    }

    if (team.status !== 'FIXED') {
      throw this.createServiceError(
        'Upload dokumen gagal. Tetapkan tim terlebih dahulu.',
        'TEAM_NOT_FIXED',
        400
      );
    }

    const membership = await this.teamRepo.findMemberByTeamAndMahasiswa(teamId, mahasiswaId);
    if (!membership || membership.invitationStatus !== 'ACCEPTED') {
      throw this.createServiceError('Forbidden', 'FORBIDDEN', 403);
    }

    const existingSubmissions = await this.submissionRepo.findByTeamId(teamId);
    if (existingSubmissions.length > 0) {
      return {
        submission: existingSubmissions[0],
        alreadyExists: true,
      };
    }

    const defaults = this.buildDefaultDraftPayload(team.code);
    let submission;
    try {
      submission = await this.submissionRepo.create({
        id: generateId(),
        teamId,
        status: 'DRAFT',
        workflowStage: 'DRAFT',
        adminVerificationStatus: 'PENDING',
        dosenVerificationStatus: 'PENDING',
        letterPurpose: data.letterPurpose || defaults.letterPurpose,
        companyName: data.companyName || defaults.companyName,
        companyAddress: data.companyAddress || defaults.companyAddress,
        companyPhone: data.companyPhone ?? defaults.companyPhone,
        companyBusinessType: data.companyBusinessType ?? defaults.companyBusinessType,
        division: data.division || defaults.division,
        startDate: data.startDate
          ? data.startDate.toISOString().split('T')[0]
          : defaults.startDate,
        endDate: data.endDate
          ? data.endDate.toISOString().split('T')[0]
          : defaults.endDate,
      });
    } catch {
      const racedSubmissions = await this.submissionRepo.findByTeamId(teamId);
      if (racedSubmissions.length > 0) {
        return {
          submission: racedSubmissions[0],
          alreadyExists: true,
        };
      }
      throw this.createServiceError('Failed to create submission', 'INTERNAL_ERROR', 500);
    }

    return {
      submission,
      alreadyExists: false,
    };
  }

  async updateSubmission(submissionId: string, mahasiswaId: string, data: {
    letterPurpose?: string;
    companyName?: string;
    companyAddress?: string;
    companyPhone?: string;
    companyBusinessType?: string;
    division?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Pengajuan tidak ditemukan.');
    }

    if (submission.status !== 'DRAFT') {
      throw new Error('Pengajuan sudah diajukan dan tidak dapat diubah.');
    }

    const team = await this.teamRepo.findById(submission.teamId);
    if (!team || team.leaderMahasiswaId !== mahasiswaId) {
      throw new Error('Hanya ketua tim yang dapat mengubah pengajuan.');
    }

    return await this.submissionRepo.update(submissionId, data);
  }

  async submitForReview(submissionId: string, mahasiswaId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw this.createServiceError('Pengajuan tidak ditemukan.', 'SUBMISSION_NOT_FOUND', 404);
    }

    if (submission.status !== 'DRAFT') {
      throw new Error('Pengajuan sudah diajukan dan tidak dapat diubah.');
    }

    const team = await this.teamRepo.findById(submission.teamId);
    if (!team || team.leaderMahasiswaId !== mahasiswaId) {
      throw new Error('Hanya ketua tim yang dapat mengajukan.');
    }

    if (!submission.letterPurpose || !submission.companyName || !submission.companyAddress || 
        !submission.division || !submission.startDate || !submission.endDate) {
      throw new Error('Semua kolom wajib diisi sebelum mengajukan untuk ditinjau.');
    }

    return await this.submissionRepo.update(submissionId, { 
      status: 'PENDING_REVIEW',
      workflowStage: 'PENDING_ADMIN_REVIEW',
      submittedAt: new Date(),
      adminVerificationStatus: 'PENDING',
      adminVerifiedAt: null,
      adminVerifiedByAdminId: null,
      adminRejectionReason: null,
      dosenVerificationStatus: 'PENDING',
      dosenVerifiedAt: null,
      dosenVerifiedByDosenId: null,
      dosenRejectionReason: null,
      finalSignedFileUrl: null,
    });
  }

  async getMySubmissions(mahasiswaId: string) {
    const teams = await this.teamRepo.findTeamsByMahasiswaId(mahasiswaId);
    const teamIds = teams.map(t => t.id);

    const submissions = [];
    for (const teamId of teamIds) {
      const teamSubmissions = await this.submissionRepo.findByTeamId(teamId);
      submissions.push(...teamSubmissions);
    }

    return submissions.map((submission) => this.toStudentSubmissionView(submission));
  }

  async canAccessSubmission(submissionId: string, mahasiswaId: string): Promise<boolean> {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      return false;
    }

    const member = await this.teamRepo.findMemberByTeamAndMahasiswa(submission.teamId, mahasiswaId);
    return Boolean(member && member.invitationStatus === 'ACCEPTED');
  }

  async uploadDocument(
    submissionId: string, 
    uploadedByMahasiswaId: string,
    memberMahasiswaId: string,
    file: File,
    documentType: 'PROPOSAL_KETUA' | 'SURAT_KESEDIAAN' | 'FORM_PERMOHONAN' | 'KRS_SEMESTER_4' | 'DAFTAR_KUMPULAN_NILAI' | 'BUKTI_PEMBAYARAN_UKT',
    authMahasiswaId: string
  ) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw this.createServiceError(
        'Upload dokumen gagal. Tetapkan tim terlebih dahulu.',
        'SUBMISSION_NOT_FOUND',
        404
      );
    }

    if (submission.status !== 'DRAFT') {
      throw new Error('Pengajuan sudah diajukan dan tidak dapat diubah.');
    }

    const requesterMembership = await this.teamRepo.findMemberByTeamAndMahasiswa(submission.teamId, authMahasiswaId);
    if (!requesterMembership || requesterMembership.invitationStatus !== 'ACCEPTED') {
      const unauthorized: Error = new Error('Unauthorized - not team member');
      unauthorized.statusCode = 403;
      throw unauthorized;
    }

    const member = await this.teamRepo.findMemberByTeamAndMahasiswa(submission.teamId, memberMahasiswaId);
    if (!member || member.invitationStatus !== 'ACCEPTED') {
      const invalidMember: Error = new Error('User is not a member of this team');
      invalidMember.statusCode = 403;
      throw invalidMember;
    }

    let finalUploadedByMahasiswaId = uploadedByMahasiswaId || authMahasiswaId;
    if (!finalUploadedByMahasiswaId) {
      throw new Error('uploadedByMahasiswaId is required');
    }

    const uploaderMembership = await this.teamRepo.findMemberByTeamAndMahasiswa(submission.teamId, finalUploadedByMahasiswaId);
    if (!uploaderMembership || uploaderMembership.invitationStatus !== 'ACCEPTED') {
      const unauthorizedUploader: Error = new Error('Unauthorized - uploader is not team member');
      unauthorizedUploader.statusCode = 403;
      throw unauthorizedUploader;
    }

    if (!this.storageService) {
      throw new Error('Storage service not configured');
    }

    const existingDoc = await this.submissionRepo.findExistingDocument(
      submissionId,
      documentType,
      memberMahasiswaId
    );

    if (existingDoc) {
      if (existingDoc.status === 'REJECTED') {
        try {
          await this.storageService.deleteFile(existingDoc.fileName);
        } catch (err) {
          console.warn('⚠️ [SubmissionService] Failed to delete old file from storage:', err);
        }
        await this.submissionRepo.deleteDocument(existingDoc.id);
      }
      else {
        const error: Error = new Error(
          `Dokumen ${documentType} sudah diupload dengan status ${existingDoc.status}. Tidak dapat upload ulang.`
        );
        error.statusCode = 409;
        throw error;
      }
    }

    const allowedTypes = ['pdf', 'docx', 'doc'];
    if (!this.storageService.validateFileType(file.name, allowedTypes)) {
      throw new Error('Invalid file type. Only PDF and DOCX are allowed');
    }

    const maxSizeMB = 10;
    if (!this.storageService.validateFileSize(file.size, maxSizeMB)) {
      throw new Error(`File size exceeds ${maxSizeMB}MB limit`);
    }

    const uniqueFileName = this.storageService.generateUniqueFileName(file.name);
    const { url, key } = await this.storageService.uploadFile(file, uniqueFileName, 'submissions');

    let sanitizedFileType = file.type || 'application/octet-stream';
    if (sanitizedFileType.includes(';')) {
      sanitizedFileType = sanitizedFileType.split(';')[0].trim();
    }

    const newDocument = await this.submissionRepo.addDocument({
      id: generateId(),
      submissionId,
      documentType,
      memberMahasiswaId,
      uploadedByMahasiswaId: finalUploadedByMahasiswaId,
      fileName: key,
      originalName: file.name,
      fileType: sanitizedFileType,
      fileSize: file.size,
      fileUrl: url,
    });
    
    return newDocument;
  }

  async getDocuments(submissionId: string, mahasiswaId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      const notFound: Error = new Error('Submission not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    const membership = await this.teamRepo.findMemberByTeamAndMahasiswa(submission.teamId, mahasiswaId);
    if (!membership || membership.invitationStatus !== 'ACCEPTED') {
      const unauthorized: Error = new Error('Unauthorized - not team member');
      unauthorized.statusCode = 403;
      throw unauthorized;
    }

    return await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
  }

  async getLetterRequestStatus(submissionId: string, mahasiswaId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      const error: Error = new Error('Submission tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    const requesterMembership = await this.teamRepo.findMemberByTeamAndMahasiswa(submission.teamId, mahasiswaId);
    if (!requesterMembership || requesterMembership.invitationStatus !== 'ACCEPTED') {
      const error: Error = new Error('Anda tidak memiliki akses ke submission ini');
      error.statusCode = 403;
      throw error;
    }

    const teamMembers = await this.teamRepo.findMembersByTeamId(submission.teamId);
    const acceptedMahasiswaIds = Array.from(
      new Set(
        teamMembers
          .filter((member) => member.invitationStatus === 'ACCEPTED')
          .map((member) => member.mahasiswaId)
      )
    );

    const [kesediaanRows, permohonanRows] = await Promise.all([
      this.suratKesediaanRepo.findLatestByMahasiswaIds(acceptedMahasiswaIds),
      this.suratPermohonanRepo.findLatestByMahasiswaIds(acceptedMahasiswaIds, submissionId),
    ]);

    const latestKesediaanByMember = new Map<string, any>();
    for (const row of kesediaanRows) {
      if (!latestKesediaanByMember.has(row.memberMahasiswaId)) {
        latestKesediaanByMember.set(row.memberMahasiswaId, row);
      }
    }

    const latestPermohonanByMember = new Map<string, any>();
    for (const row of permohonanRows) {
      if (!latestPermohonanByMember.has(row.memberMahasiswaId)) {
        latestPermohonanByMember.set(row.memberMahasiswaId, row);
      }
    }

    const documentTypes: LetterDocumentType[] = ['SURAT_KESEDIAAN', 'FORM_PERMOHONAN'];
    const response: any[] = [];

    for (const memberMahasiswaId of acceptedMahasiswaIds) {
      for (const documentType of documentTypes) {
        const latestRequest = documentType === 'SURAT_KESEDIAAN'
          ? latestKesediaanByMember.get(memberMahasiswaId)
          : latestPermohonanByMember.get(memberMahasiswaId);

        response.push({
          memberMahasiswaId,
          documentType,
          isAlreadySubmitted: Boolean(latestRequest),
          latestStatus: latestRequest ? this.normalizeLetterStatus(latestRequest.status) : null,
          latestRequestId: latestRequest?.id || null,
          dosenName: latestRequest?.dosenName || null,
          signedFileUrl: latestRequest?.signedFileUrl || null,
          rejectionReason: latestRequest?.rejectionReason || null,
          submittedAt: latestRequest?.submittedAt?.toISOString() || null,
        });
      }
    }

    return response;
  }

  private normalizeLetterStatus(status: string | null | undefined): LetterRequestStatus {
    if (!status) return null;
    const normalized = status.toUpperCase();
    if (normalized === 'MENUNGGU' || normalized === 'DISETUJUI' || normalized === 'DITOLAK') return normalized;
    if (normalized === 'PENDING') return 'MENUNGGU';
    if (normalized === 'APPROVED') return 'DISETUJUI';
    if (normalized === 'REJECTED') return 'DITOLAK';
    return null;
  }

  async deleteDocument(documentId: string, mahasiswaId: string) {
    const document = await this.submissionRepo.findDocumentById(documentId);
    if (!document) {
      const notFound: Error = new Error('Document not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    const submission = await this.submissionRepo.findById(document.submissionId);
    if (!submission) {
      const notFound: Error = new Error('Submission not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    const membership = await this.teamRepo.findMemberByTeamAndMahasiswa(submission.teamId, mahasiswaId);
    if (!membership || membership.invitationStatus !== 'ACCEPTED') {
      const unauthorized: Error = new Error('Unauthorized - not team member');
      unauthorized.statusCode = 403;
      throw unauthorized;
    }

    const canDelete = document.status === 'REJECTED' || submission.status === 'DRAFT';
    if (!canDelete) {
      const forbidden: Error = new Error(`Cannot delete document with status ${document.status} in ${submission.status} submission`);
      forbidden.statusCode = 403;
      throw forbidden;
    }

    if (this.storageService) {
      try {
        await this.storageService.deleteFile(document.fileName);
      } catch (err) {
        console.warn('⚠️ [SubmissionService] Failed to delete file from storage:', err);
      }
    }

    await this.submissionRepo.deleteDocument(documentId);
    return { success: true, message: 'Document deleted successfully' };
  }

  async getSubmissionById(submissionId: string) {
    const submission = await this.submissionRepo.findByIdWithTeam(submissionId);
    if (!submission) return null;
    return this.toStudentSubmissionView(submission);
  }

  async approveSubmission(submissionId: string, adminId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) throw new Error('Submission not found');

    const currentStage = submission.workflowStage ?? (submission.status === 'PENDING_REVIEW' ? 'PENDING_ADMIN_REVIEW' : submission.status);
    if (currentStage !== 'PENDING_ADMIN_REVIEW') throw new Error('Only pending submissions can be approved');

    return await this.submissionRepo.update(submissionId, {
      status: 'PENDING_REVIEW',
      workflowStage: 'PENDING_DOSEN_VERIFICATION',
      adminVerificationStatus: 'APPROVED',
      adminVerifiedAt: new Date(),
      adminVerifiedByAdminId: adminId,
      adminRejectionReason: null,
      dosenVerificationStatus: 'PENDING',
      dosenVerifiedAt: null,
      dosenVerifiedByDosenId: null,
      dosenRejectionReason: null,
    });
  }

  async rejectSubmission(submissionId: string, adminId: string, rejectionReason: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) throw new Error('Submission not found');

    const currentStage = submission.workflowStage ?? (submission.status === 'PENDING_REVIEW' ? 'PENDING_ADMIN_REVIEW' : submission.status);
    if (currentStage !== 'PENDING_ADMIN_REVIEW') throw new Error('Only pending submissions can be rejected');

    return await this.submissionRepo.update(submissionId, {
      status: 'PENDING_REVIEW',
      rejectionReason,
      workflowStage: 'REJECTED_ADMIN',
      adminVerificationStatus: 'REJECTED',
      adminVerifiedAt: new Date(),
      adminVerifiedByAdminId: adminId,
      adminRejectionReason: rejectionReason,
      dosenVerificationStatus: 'PENDING',
      dosenVerifiedAt: null,
      dosenVerifiedByDosenId: null,
      dosenRejectionReason: null,
    });
  }

  async resetToDraft(submissionId: string, mahasiswaId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) throw new Error('Pengajuan tidak ditemukan.');

    const rejectedStages = new Set(['REJECTED', 'REJECTED_ADMIN', 'REJECTED_DOSEN']);
    if (!rejectedStages.has(submission.status) && !rejectedStages.has(submission.workflowStage)) {
      throw new Error('Hanya pengajuan yang ditolak yang dapat diajukan ulang.');
    }

    const userMembership = await this.teamRepo.findMemberByTeamAndMahasiswa(submission.teamId, mahasiswaId);
    if (!userMembership || userMembership.invitationStatus !== 'ACCEPTED') {
      throw new Error('Anda tidak authorized untuk mengajukan ulang pengajuan ini.');
    }

    const now = new Date();
    const currentHistory = Array.isArray(submission.statusHistory) ? submission.statusHistory : [];
    const newHistory = [...currentHistory, { status: 'DRAFT', date: now.toISOString(), actor: 'SYSTEM', reason: 'User reset rejected submission to draft' }];

    return await this.submissionRepo.update(submissionId, {
      status: 'DRAFT',
      workflowStage: 'DRAFT',
      adminVerificationStatus: 'PENDING',
      adminVerifiedAt: null,
      adminVerifiedByAdminId: null,
      adminRejectionReason: null,
      dosenVerificationStatus: 'PENDING',
      dosenVerifiedAt: null,
      dosenVerifiedByDosenId: null,
      dosenRejectionReason: null,
      finalSignedFileUrl: null,
      rejectionReason: null,
      submittedAt: null,
      statusHistory: newHistory,
      updatedAt: now,
      documentReviews: {},
    });
  }
}
