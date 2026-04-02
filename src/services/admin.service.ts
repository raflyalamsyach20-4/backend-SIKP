import { SubmissionRepository } from '@/repositories/submission.repository';
import { LetterService } from './letter.service';
import { z } from 'zod';

export class AdminService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private letterService?: LetterService
  ) {}

  private getCurrentStage(submission: any) {
    return submission.workflowStage ?? (submission.status === 'PENDING_REVIEW' ? 'PENDING_ADMIN_REVIEW' : submission.status);
  }

  private matchesStatusBucket(
    submission: any,
    status: 'DRAFT' | 'PENDING_REVIEW' | 'REJECTED' | 'APPROVED'
  ) {
    const currentStage = this.getCurrentStage(submission);

    if (status === 'DRAFT') {
      return currentStage === 'DRAFT';
    }

    if (status === 'PENDING_REVIEW') {
      return currentStage === 'PENDING_ADMIN_REVIEW' || currentStage === 'PENDING_DOSEN_VERIFICATION';
    }

    if (status === 'APPROVED') {
      return currentStage === 'COMPLETED';
    }

    return currentStage === 'REJECTED_ADMIN' || currentStage === 'REJECTED_DOSEN';
  }

  async getAllSubmissions() {
    return await this.submissionRepo.findAllForAdmin();
  }

  async getSubmissionsByStatus(status: 'DRAFT' | 'PENDING_REVIEW' | 'REJECTED' | 'APPROVED') {
    const submissions = await this.submissionRepo.findAllForAdmin();
    return submissions.filter((submission) => this.matchesStatusBucket(submission, status));
  }

  async getSubmissionById(id: string) {
    const submission = await this.submissionRepo.findByIdWithTeam(id);
    if (!submission) {
      throw new Error('Submission not found');
    }

    // Get letters if any
    const letters = await this.submissionRepo.findLettersBySubmissionId(id);

    return {
      ...submission,
      letters,
      submissionStatus: submission.workflowStage ?? submission.status,
      submission_status: submission.workflowStage ?? submission.status,
      adminStatus: submission.adminVerificationStatus ?? 'PENDING',
      admin_status: submission.adminVerificationStatus ?? 'PENDING',
      isAdminApproved: (submission.adminVerificationStatus ?? 'PENDING') === 'APPROVED',
    };
  }

  /**
   * Update submission status (APPROVED or REJECTED)
   * Implements requirements from BACKEND_ADMIN_APPROVE_REJECT_FLOW
   * 
   * When APPROVED:
   * - Set status = APPROVED
      }
    }

    const normalizedLetterNumber = letterNumber?.trim();
   * - Set status = REJECTED
   * - Set rejectionReason
   * - Set approvedBy = admin user id (audit trail)
   * - Do NOT create any documents
   * - Append to statusHistory
   */
  async updateSubmissionStatus(
    submissionId: string,
    adminId: string,
    status: 'APPROVED' | 'REJECTED',
    rejectionReason?: string,
    documentReviews?: Record<string, string>,
    letterNumber?: string,
  ) {
    // Validate input
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new Error('Status must be either APPROVED or REJECTED');
    }

    // Debug logging
    console.log('[updateSubmissionStatus] Received params:', {
      submissionId,
      adminId,
      status,
      rejectionReason,
      letterNumber,
    });

    // Check submission exists
    const submission = await this.submissionRepo.findById(submissionId);
    
    console.log('[updateSubmissionStatus] Found submission:', {
      found: !!submission,
      submissionData: submission ? {
        id: submission.id,
        status: submission.status,
        teamId: submission.teamId,
      } : null
    });
    
    if (!submission) {
      // Try to find all submissions to help debug
      const allSubmissions = await this.submissionRepo.findAll();
      console.log('[updateSubmissionStatus] Total submissions in DB:', allSubmissions.length);
      console.log('[updateSubmissionStatus] All submission IDs:', allSubmissions.map(s => s.id));
      
      throw new Error('Submission tidak ditemukan');
    }

    // Validate current status
    const currentStage = this.getCurrentStage(submission);
    if (currentStage !== 'PENDING_ADMIN_REVIEW') {
      console.log('[updateSubmissionStatus] Invalid status:', {
        currentStatus: submission.status,
        currentWorkflowStage: currentStage,
        required: 'PENDING_ADMIN_REVIEW'
      });
      throw new Error('Can only update submissions with PENDING_ADMIN_REVIEW stage');
    }

    // Validate rejection reason when rejecting
    if (status === 'REJECTED') {
      if (!rejectionReason || rejectionReason.trim().length === 0) {
        throw new Error('Rejection reason is required when rejecting');
      }
    }

    // ✅ NEW: Validate document reviews
    if (status === 'APPROVED') {
      if (!letterNumber || letterNumber.trim().length === 0) {
        throw new Error('Nomor surat wajib diisi saat menyetujui submission');
      }

      // When approving, all documents must be marked as "approved"
      if (!documentReviews || Object.keys(documentReviews).length === 0) {
        throw new Error('documentReviews is required. Must specify status for each document');
      }

      const hasRejected = Object.values(documentReviews).some(
        (docStatus) => docStatus === 'rejected'
      );

      if (hasRejected) {
        throw new Error(
          'Tidak dapat approve submission jika ada dokumen yang di-reject. Harap review dokumentasi.'
        );
      }

      const hasPending = Object.values(documentReviews).some(
        (docStatus) => docStatus === 'pending' || docStatus !== 'approved'
      );

      if (hasPending) {
        throw new Error(
          'Semua dokumen harus di-approve sebelum approval submission'
        );
      }
    }

    if (status === 'REJECTED') {
      if (!documentReviews || Object.keys(documentReviews).length === 0) {
        throw new Error('documentReviews is required. Must specify status for each document');
      }


    }

    const normalizedLetterNumber = letterNumber?.trim();

    // ✅ Prepare status history entry
    const now = new Date();
    const historyEntry: any = {
      status,
      workflowStage: status === 'APPROVED' ? 'PENDING_DOSEN_VERIFICATION' : 'REJECTED_ADMIN',
      actor: 'ADMIN',
      date: now.toISOString(),
    };

    if (status === 'REJECTED') {
      historyEntry.reason = rejectionReason;
    }
    if (status === 'APPROVED' && normalizedLetterNumber) {
      historyEntry.letterNumber = normalizedLetterNumber;
    }

    // ✅ Append to existing history
    const currentHistory = Array.isArray(submission.statusHistory) ? submission.statusHistory : [];
    const newHistory = [...currentHistory, historyEntry];

    // Build update data
    const updateData: any = {
      status: 'PENDING_REVIEW',
      approvedBy: null,
      statusHistory: newHistory,
      documentReviews: documentReviews || {}, // ✅ Save document reviews
      updatedAt: new Date(),
      adminVerifiedBy: adminId,
      adminVerifiedAt: now,
    };

    // ✅ NEW: Update document status based on documentReviews mapping
    if (documentReviews && Object.keys(documentReviews).length > 0) {
      for (const [docId, docStatus] of Object.entries(documentReviews)) {
        const dbStatus = docStatus === 'approved' ? 'APPROVED' : 'REJECTED';
        await this.submissionRepo.updateDocumentStatus(docId, dbStatus);
      }
    }

    if (status === 'APPROVED') {
      updateData.approvedAt = null;
      updateData.rejectionReason = null;
      updateData.letterNumber = normalizedLetterNumber || null;
      updateData.adminVerificationStatus = 'APPROVED';
      updateData.adminRejectionReason = null;
      updateData.dosenVerificationStatus = 'PENDING';
      updateData.dosenVerifiedAt = null;
      updateData.dosenVerifiedBy = null;
      updateData.dosenRejectionReason = null;
      updateData.workflowStage = 'PENDING_DOSEN_VERIFICATION';
      updateData.finalSignedFileUrl = null;
      
      // Perform update first
      const updated = await this.submissionRepo.update(submissionId, updateData);
      
      if (!updated) {
        throw new Error('Failed to update submission status');
      }
      
      // Get all documents for this submission
      const documents = await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
      
      // Return updated submission with documents
      return {
        ...updated,
        documents,
      };
    } else {
      // REJECTED
      updateData.rejectionReason = rejectionReason;
      updateData.approvedAt = null;
      updateData.letterNumber = null;
      updateData.adminVerificationStatus = 'REJECTED';
      updateData.adminRejectionReason = rejectionReason;
      updateData.dosenVerificationStatus = 'PENDING';
      updateData.dosenVerifiedAt = null;
      updateData.dosenVerifiedBy = null;
      updateData.dosenRejectionReason = null;
      updateData.workflowStage = 'REJECTED_ADMIN';
      updateData.finalSignedFileUrl = null;
      
      // Perform update
      const updated = await this.submissionRepo.update(submissionId, updateData);
      
      if (!updated) {
        throw new Error('Failed to update submission status');
      }
      
      return updated;
    }
  }

  async approveSubmission(
    submissionId: string,
    adminId: string,
    documentReviews?: Record<string, string>,
    letterNumber?: string,
  ) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (this.getCurrentStage(submission) !== 'PENDING_ADMIN_REVIEW') {
      throw new Error('Can only approve pending submissions');
    }

    const docs = await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
    const normalizedDocumentReviews =
      documentReviews && Object.keys(documentReviews).length > 0
        ? documentReviews
        : docs.reduce<Record<string, string>>((acc, doc) => {
            acc[doc.id] = 'approved';
            return acc;
          }, {});

    if (Object.keys(normalizedDocumentReviews).length === 0) {
      throw new Error('Tidak ada dokumen untuk diverifikasi.');
    }

    return await this.updateSubmissionStatus(
      submissionId,
      adminId,
      'APPROVED',
      undefined,
      normalizedDocumentReviews,
      letterNumber,
    );
  }

  async rejectSubmission(submissionId: string, adminId: string, reason: string, documentReviews?: Record<string, string>) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (this.getCurrentStage(submission) !== 'PENDING_ADMIN_REVIEW') {
      throw new Error('Can only reject pending submissions');
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error('Rejection reason is required');
    }

    const docs = await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
    const normalizedDocumentReviews =
      documentReviews && Object.keys(documentReviews).length > 0
        ? documentReviews
        : docs.reduce<Record<string, string>>((acc, doc, index) => {
            acc[doc.id] = index === 0 ? 'rejected' : 'approved';
            return acc;
          }, {});

    if (Object.keys(normalizedDocumentReviews).length === 0) {
      throw new Error('Tidak ada dokumen untuk diverifikasi.');
    }

    return await this.updateSubmissionStatus(
      submissionId,
      adminId,
      'REJECTED',
      reason,
      normalizedDocumentReviews
    );
  }

  async generateLetterForSubmission(submissionId: string, adminId: string, format: 'pdf' | 'docx' = 'pdf') {
    if (!this.letterService) {
      throw new Error('Letter service not configured');
    }

    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.workflowStage !== 'COMPLETED' || submission.dosenVerificationStatus !== 'APPROVED') {
      throw new Error('Final letter can only be generated after dosen verification is completed');
    }

    return await this.letterService.generateLetter(submissionId, adminId, format);
  }

  async getSubmissionStatistics() {
    const allSubmissions = await this.submissionRepo.findAll();
    
    return {
      total: allSubmissions.length,
      draft: allSubmissions.filter(s => this.matchesStatusBucket(s, 'DRAFT')).length,
      pending: allSubmissions.filter(s => this.matchesStatusBucket(s, 'PENDING_REVIEW')).length,
      pendingDosenVerification: allSubmissions.filter(s => s.workflowStage === 'PENDING_DOSEN_VERIFICATION').length,
      completed: allSubmissions.filter(s => s.workflowStage === 'COMPLETED').length,
      approved: allSubmissions.filter(s => this.matchesStatusBucket(s, 'APPROVED')).length,
      rejected: allSubmissions.filter(s => this.matchesStatusBucket(s, 'REJECTED')).length,
    };
  }
}

