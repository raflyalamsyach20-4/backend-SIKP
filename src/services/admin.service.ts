import { SubmissionRepository } from '@/repositories/submission.repository';
import { LetterService } from './letter.service';

export class AdminService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private letterService?: LetterService
  ) {}

  async getAllSubmissions() {
    return await this.submissionRepo.findAll();
  }

  async getSubmissionsByStatus(status: 'DRAFT' | 'MENUNGGU' | 'DITOLAK' | 'DITERIMA') {
    return await this.submissionRepo.findByStatus(status);
  }

  async getSubmissionById(id: string) {
    const submission = await this.submissionRepo.findById(id);
    if (!submission) {
      throw new Error('Submission not found');
    }

    // Get documents
    const documents = await this.submissionRepo.findDocumentsBySubmissionId(id);
    
    // Get letters if any
    const letters = await this.submissionRepo.findLettersBySubmissionId(id);

    return {
      ...submission,
      documents,
      letters,
    };
  }

  async approveSubmission(submissionId: string, adminId: string, autoGenerateLetter: boolean = false) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status !== 'MENUNGGU') {
      throw new Error('Can only approve pending submissions');
    }

    const updated = await this.submissionRepo.update(submissionId, {
      status: 'DITERIMA',
      approvedBy: adminId,
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

    if (submission.status !== 'MENUNGGU') {
      throw new Error('Can only reject pending submissions');
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error('Rejection reason is required');
    }

    return await this.submissionRepo.update(submissionId, {
      status: 'DITOLAK',
      rejectionReason: reason,
      approvedBy: adminId,
      approvedAt: new Date(),
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
      pending: allSubmissions.filter(s => s.status === 'MENUNGGU').length,
      approved: allSubmissions.filter(s => s.status === 'DITERIMA').length,
      rejected: allSubmissions.filter(s => s.status === 'DITOLAK').length,
    };
  }
}

