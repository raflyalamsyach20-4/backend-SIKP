import { SubmissionRepository } from '@/repositories/submission.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { SuratKesediaanRepository } from '@/repositories/surat-kesediaan.repository';
import { SuratPermohonanRepository } from '@/repositories/surat-permohonan.repository';
import { StorageService } from './storage.service';
import { generateId } from '@/utils/helpers';

type LetterDocumentType = 'SURAT_KESEDIAAN' | 'FORM_PERMOHONAN';
type LetterRequestStatus = 'MENUNGGU' | 'DISETUJUI' | 'DITOLAK' | null;

export class SubmissionService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private teamRepo: TeamRepository,
    private suratKesediaanRepo: SuratKesediaanRepository,
    private suratPermohonanRepo: SuratPermohonanRepository,
    private storageService?: StorageService
  ) {}

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

  async ensureDraftSubmissionForTeam(teamId: string, userId: string) {
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

    const membership = await this.teamRepo.findMemberByTeamAndUser(teamId, userId);
    if (!membership || membership.invitationStatus !== 'ACCEPTED') {
      throw this.createServiceError('Forbidden', 'FORBIDDEN', 403);
    }

    const existingSubmissions = await this.submissionRepo.findByTeamId(teamId);
    if (existingSubmissions.length > 0) {
      console.log('[SubmissionService] SUBMISSION_CREATE_IDEMPOTENT_HIT', {
        teamId,
        submissionId: existingSubmissions[0].id,
      });
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
        console.log('[SubmissionService] SUBMISSION_CREATE_IDEMPOTENT_HIT', {
          teamId,
          submissionId: racedSubmissions[0].id,
        });
        return {
          submission: racedSubmissions[0],
          alreadyExists: true,
        };
      }
      throw this.createServiceError('Failed to create submission', 'INTERNAL_ERROR', 500);
    }

    console.log('[SubmissionService] SUBMISSION_CREATED', {
      teamId,
      submissionId: submission.id,
    });

    return {
      submission,
      alreadyExists: false,
    };
  }

  async createSubmission(
    teamId: string, 
    userId: string,
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

    // Caller must be an accepted member of the team
    const membership = await this.teamRepo.findMemberByTeamAndUser(teamId, userId);
    if (!membership || membership.invitationStatus !== 'ACCEPTED') {
      throw this.createServiceError('Forbidden', 'FORBIDDEN', 403);
    }

    const existingSubmissions = await this.submissionRepo.findByTeamId(teamId);
    if (existingSubmissions.length > 0) {
      console.log('[SubmissionService] SUBMISSION_CREATE_IDEMPOTENT_HIT', {
        teamId,
        submissionId: existingSubmissions[0].id,
      });
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
        console.log('[SubmissionService] SUBMISSION_CREATE_IDEMPOTENT_HIT', {
          teamId,
          submissionId: racedSubmissions[0].id,
        });
        return {
          submission: racedSubmissions[0],
          alreadyExists: true,
        };
      }
      throw this.createServiceError('Failed to create submission', 'INTERNAL_ERROR', 500);
    }

    console.log('[SubmissionService] SUBMISSION_CREATED', {
      teamId,
      submissionId: submission.id,
    });

    return {
      submission,
      alreadyExists: false,
    };
  }

  async updateSubmission(submissionId: string, userId: string, data: {
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

    // Verify user is team leader
    const team = await this.teamRepo.findById(submission.teamId);
    if (!team || team.leaderId !== userId) {
      throw new Error('Hanya ketua tim yang dapat mengubah pengajuan.');
    }

    return await this.submissionRepo.update(submissionId, data);
  }

  async submitForReview(submissionId: string, userId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw this.createServiceError('Pengajuan tidak ditemukan.', 'SUBMISSION_NOT_FOUND', 404);
    }

    if (submission.status !== 'DRAFT') {
      throw new Error('Pengajuan sudah diajukan dan tidak dapat diubah.');
    }

    // Verify user is team leader
    const team = await this.teamRepo.findById(submission.teamId);
    if (!team || team.leaderId !== userId) {
      throw new Error('Hanya ketua tim yang dapat mengajukan.');
    }

    // Validate required fields
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
      adminVerifiedBy: null,
      adminRejectionReason: null,
      dosenVerificationStatus: 'PENDING',
      dosenVerifiedAt: null,
      dosenVerifiedBy: null,
      dosenRejectionReason: null,
      finalSignedFileUrl: null,
    });
  }

  async getMySubmissions(userId: string) {
    // ✅ Get ALL teams where user is an ACCEPTED member (not just leader)
    const teams = await this.teamRepo.findTeamsByMemberId(userId);
    const teamIds = teams.map(t => t.id);

    // Get submissions for those teams
    const submissions = [];
    for (const teamId of teamIds) {
      const teamSubmissions = await this.submissionRepo.findByTeamId(teamId);
      submissions.push(...teamSubmissions);
    }

    return submissions.map((submission) => this.toStudentSubmissionView(submission));
  }

  async canAccessSubmission(submissionId: string, userId: string): Promise<boolean> {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      return false;
    }

    const member = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    return Boolean(member && member.invitationStatus === 'ACCEPTED');
  }

  async uploadDocument(
    submissionId: string, 
    uploadedByUserId: string,
    memberUserId: string,
    file: File,
    documentType: 'PROPOSAL_KETUA' | 'SURAT_KESEDIAAN' | 'FORM_PERMOHONAN' | 'KRS_SEMESTER_4' | 'DAFTAR_KUMPULAN_NILAI' | 'BUKTI_PEMBAYARAN_UKT',
    authUserId: string
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

    // ✅ Requester must be an ACCEPTED member of the team
    const requesterMembership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, authUserId);
    if (!requesterMembership || requesterMembership.invitationStatus !== 'ACCEPTED') {
      const unauthorized: Error = new Error('Unauthorized - not team member');
      unauthorized.statusCode = 403;
      throw unauthorized;
    }

    // Verify member exists in team
    const member = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, memberUserId);
    if (!member || member.invitationStatus !== 'ACCEPTED') {
      const invalidMember: Error = new Error('User is not a member of this team');
      invalidMember.statusCode = 403;
      throw invalidMember;
    }

    // ✅ Ensure uploadedByUserId is set (fallback to authenticated user if not provided)
    let finalUploadedByUserId = uploadedByUserId || authUserId;
    if (!finalUploadedByUserId) {
      throw new Error('uploadedByUserId is required');
    }

    // ✅ Uploader must also be an ACCEPTED member of the team
    const uploaderMembership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, finalUploadedByUserId);
    if (!uploaderMembership || uploaderMembership.invitationStatus !== 'ACCEPTED') {
      const unauthorizedUploader: Error = new Error('Unauthorized - uploader is not team member');
      unauthorizedUploader.statusCode = 403;
      throw unauthorizedUploader;
    }

    if (!this.storageService) {
      throw new Error('Storage service not configured');
    }

    // ✅ STEP 1: Check if document already exists for this member and document type
    const existingDoc = await this.submissionRepo.findExistingDocument(
      submissionId,
      documentType,
      memberUserId
    );

    if (existingDoc) {
      console.log(`📄 [SubmissionService] Found existing document:`, {
        id: existingDoc.id,
        status: existingDoc.status,
        documentType: existingDoc.documentType,
        fileName: existingDoc.fileName,
      });

      // ✅ STEP 2: If REJECTED, allow reupload (delete old doc and file)
      if (existingDoc.status === 'REJECTED') {
        console.log(`🗑️ [SubmissionService] Deleting old REJECTED document (${existingDoc.id})...`);
        
        // Delete file from R2 storage
        try {
          await this.storageService.deleteFile(existingDoc.fileName);
          console.log(`✅ [SubmissionService] Old file deleted from R2: ${existingDoc.fileName}`);
        } catch (err) {
          console.warn('⚠️ [SubmissionService] Failed to delete old file from storage:', err);
          // Continue anyway - file might already be deleted
        }

        // Delete document record from database
        await this.submissionRepo.deleteDocument(existingDoc.id);
        console.log('✅ [SubmissionService] Old REJECTED document deleted from database');
      }
      // ✅ STEP 3: If APPROVED or PENDING, don't allow reupload
      else {
        const error: Error = new Error(
          `Dokumen ${documentType} sudah diupload dengan status ${existingDoc.status}. Tidak dapat upload ulang.`
        );
        error.statusCode = 409;
        throw error;
      }
    }

    // Validate file
    const allowedTypes = ['pdf', 'docx', 'doc'];
    if (!this.storageService.validateFileType(file.name, allowedTypes)) {
      throw new Error('Invalid file type. Only PDF and DOCX are allowed');
    }

    const maxSizeMB = 10;
    if (!this.storageService.validateFileSize(file.size, maxSizeMB)) {
      throw new Error(`File size exceeds ${maxSizeMB}MB limit`);
    }

    // ✅ STEP 4: Upload new file to R2
    console.log(`📤 [SubmissionService] Uploading new file to R2...`);
    const uniqueFileName = this.storageService.generateUniqueFileName(file.name);
    const { url, key } = await this.storageService.uploadFile(file, uniqueFileName, 'submissions');
    console.log(`✅ [SubmissionService] New file uploaded to R2: ${key}`);

    // ✅ Sanitize fileType: trim MIME type to base type (remove charset and other params)
    let sanitizedFileType = file.type || 'application/octet-stream';
    if (sanitizedFileType.includes(';')) {
      sanitizedFileType = sanitizedFileType.split(';')[0].trim();
    }

    // ✅ STEP 5: Insert new document with status PENDING
    console.log(`💾 [SubmissionService] Saving document to database with status PENDING...`);
    const newDocument = await this.submissionRepo.addDocument({
      id: generateId(),
      submissionId,
      documentType,
      memberUserId,
      uploadedByUserId: finalUploadedByUserId,
      fileName: key,
      originalName: file.name,
      fileType: sanitizedFileType,
      fileSize: file.size,
      fileUrl: url,
    });
    
    console.log(`✅ [SubmissionService] Document uploaded successfully:`, {
      id: newDocument.id,
      status: newDocument.status,
      documentType: newDocument.documentType,
    });
    
    return newDocument;
  }

  async getDocuments(submissionId: string, userId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      const notFound: Error = new Error('Submission not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    const membership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    if (!membership || membership.invitationStatus !== 'ACCEPTED') {
      const unauthorized: Error = new Error('Unauthorized - not team member');
      unauthorized.statusCode = 403;
      throw unauthorized;
    }

    return await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
  }

  async getLetterRequestStatus(submissionId: string, userId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      const error: Error = new Error('Submission tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }

    const requesterMembership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    if (!requesterMembership || requesterMembership.invitationStatus !== 'ACCEPTED') {
      const error: Error = new Error('Anda tidak memiliki akses ke submission ini');
      error.statusCode = 403;
      throw error;
    }

    const teamMembers = await this.teamRepo.findMembersByTeamId(submission.teamId);
    const acceptedMemberUserIds = Array.from(
      new Set(
        teamMembers
          .filter((member) => member.invitationStatus === 'ACCEPTED')
          .map((member) => member.userId)
      )
    );

    const [kesediaanRows, permohonanRows] = await Promise.all([
      this.suratKesediaanRepo.findLatestByMemberIds(acceptedMemberUserIds),
      // Scope surat permohonan status to current submission.
      // This ensures after team reset (new submission), dropdown returns to
      // initial "Ajukan" state instead of inheriting old submission history.
      this.suratPermohonanRepo.findLatestByMemberIds(acceptedMemberUserIds, submissionId),
    ]);

    const latestKesediaanByMember = new Map<string, {
      id: string;
      status: string;
      dosenName: string | null;
      signedFileUrl: string | null;
      rejectionReason: string | null;
      submittedAt: Date | null;
    }>();
    for (const row of kesediaanRows) {
      if (!latestKesediaanByMember.has(row.memberUserId)) {
        latestKesediaanByMember.set(row.memberUserId, {
          id: row.id,
          status: row.status,
          dosenName: row.dosenName,
          signedFileUrl: row.signedFileUrl,
          rejectionReason: row.rejectionReason,
          submittedAt: row.submittedAt,
        });
      }
    }

    const latestPermohonanByMember = new Map<string, {
      id: string;
      status: string;
      dosenName: string | null;
      signedFileUrl: string | null;
      rejectionReason: string | null;
      submittedAt: Date | null;
    }>();
    for (const row of permohonanRows) {
      if (!latestPermohonanByMember.has(row.memberUserId)) {
        latestPermohonanByMember.set(row.memberUserId, {
          id: row.id,
          status: row.status,
          dosenName: row.dosenName,
          signedFileUrl: row.signedFileUrl,
          rejectionReason: row.rejectionReason,
          submittedAt: row.submittedAt,
        });
      }
    }

    const documentTypes: LetterDocumentType[] = ['SURAT_KESEDIAAN', 'FORM_PERMOHONAN'];
    const response: Array<{
      memberUserId: string;
      documentType: LetterDocumentType;
      isAlreadySubmitted: boolean;
      latestStatus: LetterRequestStatus;
      latestRequestId: string | null;
      dosenName: string | null;
      signedFileUrl: string | null;
      rejectionReason: string | null;
      submittedAt: string | null;
    }> = [];

    for (const memberUserId of acceptedMemberUserIds) {
      for (const documentType of documentTypes) {
        const latestRequest = documentType === 'SURAT_KESEDIAAN'
          ? latestKesediaanByMember.get(memberUserId)
          : latestPermohonanByMember.get(memberUserId);

        response.push({
          memberUserId,
          documentType,
          isAlreadySubmitted: Boolean(latestRequest),
          latestStatus: latestRequest ? this.normalizeLetterStatus(latestRequest.status) : null,
          latestRequestId: latestRequest?.id || null,
          dosenName: latestRequest?.dosenName || null,
          signedFileUrl: latestRequest?.signedFileUrl || null,
          rejectionReason: latestRequest?.rejectionReason || null,
          submittedAt: this.toISOStringOrNull(latestRequest?.submittedAt),
        });
      }
    }

    return response;
  }

  private normalizeLetterStatus(status: string | null | undefined): LetterRequestStatus {
    if (!status) return null;

    const normalized = status.toUpperCase();
    if (normalized === 'MENUNGGU' || normalized === 'DISETUJUI' || normalized === 'DITOLAK') {
      return normalized;
    }

    if (normalized === 'PENDING') return 'MENUNGGU';
    if (normalized === 'APPROVED') return 'DISETUJUI';
    if (normalized === 'REJECTED') return 'DITOLAK';

    return null;
  }

  private toISOStringOrNull(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  /**
   * Delete a submission document
   * Only allowed for documents with REJECTED status or DRAFT submissions
   */
  async deleteDocument(documentId: string, userId: string) {
    // Get document info
    const document = await this.submissionRepo.findDocumentById(documentId);
    if (!document) {
      const notFound: Error = new Error('Document not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    // Get submission
    const submission = await this.submissionRepo.findById(document.submissionId);
    if (!submission) {
      const notFound: Error = new Error('Submission not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    // Verify user is team member
    const membership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    if (!membership || membership.invitationStatus !== 'ACCEPTED') {
      const unauthorized: Error = new Error('Unauthorized - not team member');
      unauthorized.statusCode = 403;
      throw unauthorized;
    }

    // ✅ Only allow delete for:
    // 1. REJECTED documents (for reupload)
    // 2. Documents in DRAFT submissions (before submit)
    const canDelete = 
      document.status === 'REJECTED' || 
      submission.status === 'DRAFT';

    if (!canDelete) {
      const forbidden: Error = new Error(
        `Cannot delete document with status ${document.status} in ${submission.status} submission`
      );
      forbidden.statusCode = 403;
      throw forbidden;
    }

    // Delete file from R2 storage
    if (this.storageService) {
      try {
        await this.storageService.deleteFile(document.fileName);
        console.log(`✅ [SubmissionService] File deleted from R2: ${document.fileName}`);
      } catch (err) {
        console.warn('⚠️ [SubmissionService] Failed to delete file from storage:', err);
        // Continue anyway - file might already be deleted
      }
    }

    // Delete document record from database
    await this.submissionRepo.deleteDocument(documentId);
    console.log(`✅ [SubmissionService] Document deleted from database: ${documentId}`);

    return { success: true, message: 'Document deleted successfully' };
  }

  async getSubmissionById(submissionId: string) {
    const submission = await this.submissionRepo.findByIdWithTeam(submissionId);
    if (!submission) {
      return null;
    }

    return this.toStudentSubmissionView(submission);
  }

  async approveSubmission(submissionId: string, approvedByUserId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    const currentStage = submission.workflowStage ?? (submission.status === 'PENDING_REVIEW' ? 'PENDING_ADMIN_REVIEW' : submission.status);
    if (currentStage !== 'PENDING_ADMIN_REVIEW') {
      throw new Error('Only pending submissions can be approved');
    }

    return await this.submissionRepo.update(submissionId, {
      status: 'PENDING_REVIEW',
      approvedAt: null,
      approvedBy: null,
      rejectionReason: null,
      workflowStage: 'PENDING_DOSEN_VERIFICATION',
      adminVerificationStatus: 'APPROVED',
      adminVerifiedAt: new Date(),
      adminVerifiedBy: approvedByUserId,
      adminRejectionReason: null,
      dosenVerificationStatus: 'PENDING',
      dosenVerifiedAt: null,
      dosenVerifiedBy: null,
      dosenRejectionReason: null,
    });
  }

  async rejectSubmission(submissionId: string, approvedByUserId: string, rejectionReason: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    const currentStage = submission.workflowStage ?? (submission.status === 'PENDING_REVIEW' ? 'PENDING_ADMIN_REVIEW' : submission.status);
    if (currentStage !== 'PENDING_ADMIN_REVIEW') {
      throw new Error('Only pending submissions can be rejected');
    }

    return await this.submissionRepo.update(submissionId, {
      status: 'PENDING_REVIEW',
      rejectionReason,
      approvedAt: null,
      approvedBy: null,
      workflowStage: 'REJECTED_ADMIN',
      adminVerificationStatus: 'REJECTED',
      adminVerifiedAt: new Date(),
      adminVerifiedBy: approvedByUserId,
      adminRejectionReason: rejectionReason,
      dosenVerificationStatus: 'PENDING',
      dosenVerifiedAt: null,
      dosenVerifiedBy: null,
      dosenRejectionReason: null,
    });
  }

  /**
   * Reset submission from REJECTED to DRAFT
   * Allows team members to resubmit after rejection
   * Appends to statusHistory
   */
  async resetToDraft(submissionId: string, userId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Pengajuan tidak ditemukan.');
    }

    // ✅ Only REJECTED submissions can be reset to DRAFT
    const rejectedStages = new Set(['REJECTED', 'REJECTED_ADMIN', 'REJECTED_DOSEN']);
    if (!rejectedStages.has(submission.status) && !rejectedStages.has(submission.workflowStage)) {
      throw new Error('Hanya pengajuan yang ditolak yang dapat diajukan ulang.');
    }

    // Verify user is team member
    const team = await this.teamRepo.findById(submission.teamId);
    if (!team) {
      throw new Error('Tim tidak ditemukan.');
    }

    // ✅ Check if user is an ACCEPTED member of the team
    const userMembership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    if (!userMembership || userMembership.invitationStatus !== 'ACCEPTED') {
      throw new Error('Anda tidak authorized untuk mengajukan ulang pengajuan ini.');
    }

    // ✅ Prepare status history entry for DRAFT
    const now = new Date();
    const draftHistoryEntry = {
      status: 'DRAFT',
      date: now.toISOString(),
    };

    // ✅ Append to existing history
    const currentHistory = Array.isArray(submission.statusHistory) ? submission.statusHistory : [];
    const newHistory = [...currentHistory, draftHistoryEntry];

    // Reset submission to DRAFT
    return await this.submissionRepo.update(submissionId, {
      status: 'DRAFT',
      workflowStage: 'DRAFT',
      rejectionReason: null,
      approvedAt: null,
      approvedBy: null,
      adminVerificationStatus: 'PENDING',
      adminVerifiedAt: null,
      adminVerifiedBy: null,
      adminRejectionReason: null,
      dosenVerificationStatus: 'PENDING',
      dosenVerifiedAt: null,
      dosenVerifiedBy: null,
      dosenRejectionReason: null,
      letterNumber: null,
      finalSignedFileUrl: null,
      documentReviews: {}, // ✅ Clear document reviews on re-submission
      statusHistory: newHistory,
    });
  }
}

