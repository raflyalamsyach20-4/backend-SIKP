import { SubmissionRepository } from '@/repositories/submission.repository';
import { ResponseLetterRepository } from '@/repositories/response-letter.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { UserRepository } from '@/repositories/user.repository';
import { TemplateRepository } from '@/repositories/template.repository';
import { LetterService } from './letter.service';
import { z } from 'zod';

type AdminActivity = {
  action: string;
  time: string;
  status: 'success' | 'info';
};

type MonthlySubmissionStat = {
  month: string;
  submissions: number;
  approved: number;
  approvalRate: number;
};

type AdminDashboardPayload = {
  totalMahasiswaKp: number;
  jumlahTimKp: number;
  mahasiswaAktifSemester4: number;
  totalPengajuanSuratPengantar: number;
  totalSuratBalasanDisetujuiTerverifikasi: number;
  totalDosenPembimbingKp: number;
  totalTemplateDokumen: number;
  statistikPengajuan: MonthlySubmissionStat[];
  activities: AdminActivity[];
};

export class AdminService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private letterService?: LetterService,
    private responseLetterRepo?: ResponseLetterRepository,
    private teamRepo?: TeamRepository,
    private userRepo?: UserRepository,
    private templateRepo?: TemplateRepository
  ) {}

  private getLastFourMonths(): Array<{ monthDate: Date; monthKey: string; monthLabel: string }> {
    const formatter = new Intl.DateTimeFormat('id-ID', { month: 'short' });
    const current = new Date();
    const startOfCurrent = new Date(current.getFullYear(), current.getMonth(), 1);
    const months: Array<{ monthDate: Date; monthKey: string; monthLabel: string }> = [];

    for (let offset = 3; offset >= 0; offset -= 1) {
      const monthDate = new Date(startOfCurrent.getFullYear(), startOfCurrent.getMonth() - offset, 1);
      const year = monthDate.getFullYear();
      const month = `${monthDate.getMonth() + 1}`.padStart(2, '0');
      const monthKey = `${year}-${month}`;
      const monthLabel = formatter.format(monthDate);
      months.push({ monthDate, monthKey, monthLabel });
    }

    return months;
  }

  private resolveSubmissionDate(submission: any): Date | null {
    const rawDate = submission.submittedAt || submission.createdAt;
    if (!rawDate) {
      return null;
    }

    const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private resolveMonthKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
  }

  private buildMonthlyStats(submissions: any[]): MonthlySubmissionStat[] {
    const monthBuckets = this.getLastFourMonths();
    const allowedKeys = new Set(monthBuckets.map((item) => item.monthKey));

    const aggregation = new Map<string, { submissions: number; approved: number }>();
    monthBuckets.forEach((item) => {
      aggregation.set(item.monthKey, { submissions: 0, approved: 0 });
    });

    submissions.forEach((submission) => {
      const date = this.resolveSubmissionDate(submission);
      if (!date) {
        return;
      }

      const monthKey = this.resolveMonthKey(date);
      if (!allowedKeys.has(monthKey)) {
        return;
      }

      const bucket = aggregation.get(monthKey);
      if (!bucket) {
        return;
      }

      bucket.submissions += 1;
      if (submission.status === 'APPROVED') {
        bucket.approved += 1;
      }
    });

    return monthBuckets.map(({ monthKey, monthLabel }) => {
      const bucket = aggregation.get(monthKey) || { submissions: 0, approved: 0 };
      const approvalRate = bucket.submissions > 0
        ? Math.round((bucket.approved / bucket.submissions) * 100)
        : 0;

      return {
        month: monthLabel,
        submissions: bucket.submissions,
        approved: bucket.approved,
        approvalRate,
      };
    });
  }

  async getDashboard(): Promise<AdminDashboardPayload> {
    if (!this.responseLetterRepo || !this.teamRepo || !this.userRepo || !this.templateRepo) {
      throw new Error('Admin dashboard dependencies are not configured');
    }

    const [
      totalMahasiswaKp,
      jumlahTimKp,
      mahasiswaAktifSemester4,
      submissionsForAdmin,
      totalSuratBalasanDisetujuiTerverifikasi,
      totalDosenPembimbingKp,
      totalTemplateDokumen,
      allSubmissions,
    ] = await Promise.all([
      this.responseLetterRepo.countApproved(),
      this.teamRepo.countFixedTeams(),
      this.userRepo.countMahasiswaBySemester(4),
      this.submissionRepo.findAllForAdmin(),
      this.responseLetterRepo.countApprovedAndVerified(),
      this.teamRepo.countDistinctDosenKpInFixedTeams(),
      this.templateRepo.countAll(),
      this.submissionRepo.findAll(),
    ]);

    return {
      totalMahasiswaKp,
      jumlahTimKp,
      mahasiswaAktifSemester4,
      totalPengajuanSuratPengantar: submissionsForAdmin.length,
      totalSuratBalasanDisetujuiTerverifikasi,
      totalDosenPembimbingKp,
      totalTemplateDokumen,
      statistikPengajuan: this.buildMonthlyStats(allSubmissions),
      activities: [],
    };
  }

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

