import { SubmissionRepository } from '@/repositories/submission.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { StorageService } from './storage.service';
import { generateId } from '@/utils/helpers';

export class SubmissionService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private teamRepo: TeamRepository,
    private storageService?: StorageService
  ) {}

  async createSubmission(
    teamId: string, 
    userId: string,
    data: {
      letterPurpose: string;
      companyName: string;
      companyAddress: string;
      division: string;
      startDate: string;
      endDate: string;
    }
  ) {
    // Verify team exists and is FIXED
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.status !== 'FIXED') {
      throw new Error('Team must be fixed before creating submission');
    }

    // Verify user is team leader
    if (team.leaderId !== userId) {
      throw new Error('Only team leader can create submission');
    }

    // Create draft submission with all data
    const submission = await this.submissionRepo.create({
      id: generateId(),
      teamId,
      letterPurpose: data.letterPurpose,
      companyName: data.companyName,
      companyAddress: data.companyAddress,
      division: data.division,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'DRAFT',
    });

    return submission;
  }

  async updateSubmission(submissionId: string, userId: string, data: {
    letterPurpose?: string;
    companyName?: string;
    companyAddress?: string;
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
      throw new Error('Pengajuan tidak ditemukan.');
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
      submittedAt: new Date()
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

    return submissions;
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
      const notFound: any = new Error('Pengajuan tidak ditemukan.');
      notFound.statusCode = 404;
      throw notFound;
    }

    if (submission.status !== 'DRAFT') {
      throw new Error('Pengajuan sudah diajukan dan tidak dapat diubah.');
    }

    // ✅ Requester must be an ACCEPTED member of the team
    const requesterMembership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, authUserId);
    if (!requesterMembership || requesterMembership.invitationStatus !== 'ACCEPTED') {
      const unauthorized: any = new Error('Unauthorized - not team member');
      unauthorized.statusCode = 403;
      throw unauthorized;
    }

    // Verify member exists in team
    const member = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, memberUserId);
    if (!member || member.invitationStatus !== 'ACCEPTED') {
      const invalidMember: any = new Error('User is not a member of this team');
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
      const unauthorizedUploader: any = new Error('Unauthorized - uploader is not team member');
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
        const error: any = new Error(
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
      const notFound: any = new Error('Submission not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    const membership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    if (!membership || membership.invitationStatus !== 'ACCEPTED') {
      const unauthorized: any = new Error('Unauthorized - not team member');
      unauthorized.statusCode = 403;
      throw unauthorized;
    }

    return await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
  }

  /**
   * Delete a submission document
   * Only allowed for documents with REJECTED status or DRAFT submissions
   */
  async deleteDocument(documentId: string, userId: string) {
    // Get document info
    const document = await this.submissionRepo.findDocumentById(documentId);
    if (!document) {
      const notFound: any = new Error('Document not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    // Get submission
    const submission = await this.submissionRepo.findById(document.submissionId);
    if (!submission) {
      const notFound: any = new Error('Submission not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    // Verify user is team member
    const membership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    if (!membership || membership.invitationStatus !== 'ACCEPTED') {
      const unauthorized: any = new Error('Unauthorized - not team member');
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
      const forbidden: any = new Error(
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
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      return null;
    }

    const team = await this.teamRepo.findById(submission.teamId);
    const documents = await this.submissionRepo.findDocumentsBySubmissionId(submissionId);

    let members: Array<{
      id: string;
      user: { id: string; name: string | null; email: string | null; nim: string | null; prodi: string | null };
      role: string;
      status: string;
    }> = [];

    if (team) {
      const teamMembers = await this.teamRepo.findMembersWithUserDataByTeamId(submission.teamId);
      members = teamMembers.map((m) => ({
        id: m.id,
        user: {
          id: m.user.id,
          name: m.user.nama ?? null,
          email: m.user.email ?? null,
          nim: m.user.nim ?? null,
          prodi: m.user.prodi ?? null,
        },
        role: m.role,
        status: m.invitationStatus,
      }));
    }

    return {
      ...submission,
      team: team
        ? {
            ...team,
            members,
          }
        : null,
      documents,
    };
  }

  async approveSubmission(submissionId: string, approvedByUserId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status !== 'PENDING_REVIEW') {
      throw new Error('Only pending submissions can be approved');
    }

    return await this.submissionRepo.update(submissionId, {
      status: 'APPROVED',
      approvedAt: new Date(),
    });
  }

  async rejectSubmission(submissionId: string, approvedByUserId: string, rejectionReason: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status !== 'PENDING_REVIEW') {
      throw new Error('Only pending submissions can be rejected');
    }

    return await this.submissionRepo.update(submissionId, {
      status: 'REJECTED',
      rejectionReason,
      approvedAt: new Date(),
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
    if (submission.status !== 'REJECTED') {
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
      rejectionReason: null,
      documentReviews: {}, // ✅ Clear document reviews on re-submission
      statusHistory: newHistory,
    });
  }
}

