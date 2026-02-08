import { SubmissionRepository } from '@/repositories/submission.repository';
import { LetterService } from './letter.service';
import { z } from 'zod';

export class AdminService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private letterService?: LetterService
  ) {}

  async getAllSubmissions() {
    return await this.submissionRepo.findAllForAdmin();
  }

  async getSubmissionsByStatus(status: 'DRAFT' | 'PENDING_REVIEW' | 'REJECTED' | 'APPROVED') {
    return await this.submissionRepo.findByStatus(status);
  }

  async getSubmissionById(id: string) {
    const submission = await (this.submissionRepo as any).findByIdWithTeam(id);
    if (!submission) {
      throw new Error('Submission not found');
    }

    // Get letters if any
    const letters = await this.submissionRepo.findLettersBySubmissionId(id);

    return {
      ...submission,
      letters,
    };
  }

  /**
   * Update submission status (APPROVED or REJECTED)
   * Implements requirements from BACKEND_ADMIN_APPROVE_REJECT_FLOW
   * 
   * When APPROVED:
   * - Set status = APPROVED
   * - Set approvedAt = current timestamp
   * - Set approvedBy = admin user id (audit trail)
   * - Auto-generate dummy SURAT_PENGANTAR document
   * - Append to statusHistory
   * 
   * When REJECTED:
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
    documentReviews?: Record<string, string>
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
    if (submission.status !== 'PENDING_REVIEW') {
      console.log('[updateSubmissionStatus] Invalid status:', {
        currentStatus: submission.status,
        required: 'PENDING_REVIEW'
      });
      throw new Error('Can only update submissions with PENDING_REVIEW status');
    }

    // Validate rejection reason when rejecting
    if (status === 'REJECTED') {
      if (!rejectionReason || rejectionReason.trim().length === 0) {
        throw new Error('Rejection reason is required when rejecting');
      }
    }

    // ✅ Prepare status history entry
    const now = new Date();
    const historyEntry: any = {
      status,
      date: now.toISOString(),
    };

    if (status === 'REJECTED') {
      historyEntry.reason = rejectionReason;
    }

    // ✅ Append to existing history
    const currentHistory = Array.isArray(submission.statusHistory) ? submission.statusHistory : [];
    const newHistory = [...currentHistory, historyEntry];

    // Build update data
    const updateData: any = {
      status,
      approvedBy: adminId, // ✅ Track admin yang approve/reject
      statusHistory: newHistory,
      updatedAt: new Date(),
    };

    if (status === 'APPROVED') {
      updateData.approvedAt = new Date();
      updateData.rejectionReason = null;
      
      // Perform update first
      const updated = await this.submissionRepo.update(submissionId, updateData);
      
      if (!updated) {
        throw new Error('Failed to update submission status');
      }
      
      // ✅ Auto-generate dummy SURAT_PENGANTAR document
      const newDocument = await this.submissionRepo.createCoverLetterDocument(
        submissionId, 
        adminId, 
        submission.teamId
      );
      
      console.log('[updateSubmissionStatus] Created SURAT_PENGANTAR:', newDocument);
      
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
      
      // Perform update
      const updated = await this.submissionRepo.update(submissionId, updateData);
      
      if (!updated) {
        throw new Error('Failed to update submission status');
      }
      
      return updated;
    }
  }

  async approveSubmission(submissionId: string, adminId: string, autoGenerateLetter: boolean = false) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status !== 'PENDING_REVIEW') {
      throw new Error('Can only approve pending submissions');
    }

    const updated = await this.submissionRepo.update(submissionId, {
      status: 'APPROVED',
      approvedAt: new Date(),
    });

    // Auto generate letter if requested
    if (autoGenerateLetter && this.letterService) {
      await this.letterService.generateLetter(submissionId, adminId, 'pdf');
    }

    return updated;
  }

  async rejectSubmission(submissionId: string, adminId: string, reason: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status !== 'PENDING_REVIEW') {
      throw new Error('Can only reject pending submissions');
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error('Rejection reason is required');
    }

    return await this.submissionRepo.update(submissionId, {
      status: 'REJECTED',
      rejectionReason: reason,
      approvedAt: null,
    });
  }

  async generateLetterForSubmission(submissionId: string, adminId: string, format: 'pdf' | 'docx' = 'pdf') {
    if (!this.letterService) {
      throw new Error('Letter service not configured');
    }

    return await this.letterService.generateLetter(submissionId, adminId, format);
  }

  async getSubmissionStatistics() {
    const allSubmissions = await this.submissionRepo.findAll();
    
    return {
      total: allSubmissions.length,
      draft: allSubmissions.filter(s => s.status === 'DRAFT').length,
      pending: allSubmissions.filter(s => s.status === 'PENDING_REVIEW').length,
      approved: allSubmissions.filter(s => s.status === 'APPROVED').length,
      rejected: allSubmissions.filter(s => s.status === 'REJECTED').length,
    };
  }
}

