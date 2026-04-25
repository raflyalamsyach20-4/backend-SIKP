import { SubmissionRepository } from '@/repositories/submission.repository';
import { ResponseLetterRepository } from '@/repositories/response-letter.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { TemplateRepository } from '@/repositories/template.repository';
import { LetterService } from './letter.service';
import { submissions } from '@/db/schema';
import { createDbClient } from '@/db';

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

type SubmissionLike = {
  status?: string | null;
  workflowStage?: string | null;
  submittedAt?: Date | string | null;
  createdAt?: Date | string | null;
  statusHistory?: unknown;
  adminVerificationStatus?: string | null;
};

type StatusHistoryEntry = {
  status: 'APPROVED' | 'REJECTED';
  workflowStage: 'PENDING_DOSEN_VERIFICATION' | 'REJECTED_ADMIN';
  actor: 'ADMIN';
  date: string;
  reason?: string;
  letterNumber?: string;
};

export class AdminService {
  private submissionRepo: SubmissionRepository;
  private letterService: LetterService;
  private responseLetterRepo: ResponseLetterRepository;
  private teamRepo: TeamRepository;
  private templateRepo: TemplateRepository;

  constructor(
    private env: CloudflareBindings
  ) {
    const db = createDbClient(env.DATABASE_URL);
    this.letterService = new LetterService(env);
    this.submissionRepo = new SubmissionRepository(db);
    this.responseLetterRepo = new ResponseLetterRepository(db);
    this.teamRepo = new TeamRepository(db);
    this.templateRepo = new TemplateRepository(db);
  }

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

  private resolveSubmissionDate(submission: SubmissionLike): Date | null {
    const rawDate = submission.submittedAt || submission.createdAt;
    if (!rawDate) return null;
    const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private resolveMonthKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
  }

  private buildMonthlyStats(submissions: SubmissionLike[]): MonthlySubmissionStat[] {
    const monthBuckets = this.getLastFourMonths();
    const allowedKeys = new Set(monthBuckets.map((item) => item.monthKey));
    const aggregation = new Map<string, { submissions: number; approved: number }>();
    
    monthBuckets.forEach((item) => {
      aggregation.set(item.monthKey, { submissions: 0, approved: 0 });
    });

    submissions.forEach((submission) => {
      const date = this.resolveSubmissionDate(submission);
      if (!date) return;
      const monthKey = this.resolveMonthKey(date);
      if (!allowedKeys.has(monthKey)) return;
      const bucket = aggregation.get(monthKey);
      if (!bucket) return;
      bucket.submissions += 1;
      if (submission.status === 'APPROVED') bucket.approved += 1;
    });

    return monthBuckets.map(({ monthKey, monthLabel }) => {
      const bucket = aggregation.get(monthKey) || { submissions: 0, approved: 0 };
      const approvalRate = bucket.submissions > 0 ? Math.round((bucket.approved / bucket.submissions) * 100) : 0;
      return { month: monthLabel, submissions: bucket.submissions, approved: bucket.approved, approvalRate };
    });
  }

  async getDashboard(): Promise<AdminDashboardPayload> {
    if (!this.responseLetterRepo || !this.teamRepo || !this.templateRepo) {
      throw new Error('Admin dashboard dependencies are not configured');
    }

    const [
      totalMahasiswaKp,
      jumlahTimKp,
      submissionsForAdmin,
      totalSuratBalasanDisetujuiTerverifikasi,
      totalDosenPembimbingKp,
      totalTemplateDokumen,
      allSubmissions,
    ] = await Promise.all([
      this.responseLetterRepo.countApproved(),
      this.teamRepo.countFixedTeams(),
      this.submissionRepo.findAllForAdmin(),
      this.responseLetterRepo.countApprovedAndVerified(),
      this.teamRepo.countDistinctDosenKpInFixedTeams(),
      this.templateRepo.countAll(),
      this.submissionRepo.findAll(),
    ]);

    return {
      totalMahasiswaKp,
      jumlahTimKp,
      mahasiswaAktifSemester4: 0, // Legacy field, set to 0 as userRepo removed
      totalPengajuanSuratPengantar: submissionsForAdmin.length,
      totalSuratBalasanDisetujuiTerverifikasi,
      totalDosenPembimbingKp,
      totalTemplateDokumen,
      statistikPengajuan: this.buildMonthlyStats(allSubmissions),
      activities: [],
    };
  }

  private getCurrentStage(submission: SubmissionLike) {
    return submission.workflowStage ?? (submission.status === 'PENDING_REVIEW' ? 'PENDING_ADMIN_REVIEW' : submission.status);
  }

  private matchesStatusBucket(submission: SubmissionLike, status: 'DRAFT' | 'PENDING_REVIEW' | 'REJECTED' | 'APPROVED') {
    const currentStage = this.getCurrentStage(submission);
    if (status === 'DRAFT') return currentStage === 'DRAFT';
    if (status === 'PENDING_REVIEW') return currentStage === 'PENDING_ADMIN_REVIEW' || currentStage === 'PENDING_DOSEN_VERIFICATION';
    if (status === 'APPROVED') return currentStage === 'COMPLETED';
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
    if (!submission) throw new Error('Submission not found');
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

  async updateSubmissionStatus(
    submissionId: string,
    adminId: string,
    status: 'APPROVED' | 'REJECTED',
    rejectionReason?: string,
    documentReviews?: Record<string, string>,
    letterNumber?: string,
  ) {
    if (!['APPROVED', 'REJECTED'].includes(status)) throw new Error('Status must be either APPROVED or REJECTED');

    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) throw new Error('Submission tidak ditemukan');

    const currentStage = this.getCurrentStage(submission);
    if (currentStage !== 'PENDING_ADMIN_REVIEW') throw new Error('Can only update submissions with PENDING_ADMIN_REVIEW stage');

    if (status === 'REJECTED' && (!rejectionReason || rejectionReason.trim().length === 0)) {
      throw new Error('Rejection reason is required when rejecting');
    }

    if (status === 'APPROVED') {
      if (!letterNumber || letterNumber.trim().length === 0) throw new Error('Nomor surat wajib diisi saat menyetujui submission');
      if (!documentReviews || Object.keys(documentReviews).length === 0) throw new Error('documentReviews is required');
      const hasRejected = Object.values(documentReviews).some((docStatus) => docStatus === 'rejected');
      if (hasRejected) throw new Error('Tidak dapat approve submission jika ada dokumen yang di-reject');
    }

    const normalizedLetterNumber = letterNumber?.trim();
    const now = new Date();
    const historyEntry: StatusHistoryEntry = {
      status,
      workflowStage: status === 'APPROVED' ? 'PENDING_DOSEN_VERIFICATION' : 'REJECTED_ADMIN',
      actor: 'ADMIN',
      date: now.toISOString(),
    };

    if (status === 'REJECTED') historyEntry.reason = rejectionReason;
    if (status === 'APPROVED' && normalizedLetterNumber) historyEntry.letterNumber = normalizedLetterNumber;

    const currentHistory = Array.isArray(submission.statusHistory) ? submission.statusHistory : [];
    const newHistory = [...currentHistory, historyEntry];

    const updateData: Partial<typeof submissions.$inferInsert> = {
      status: 'PENDING_REVIEW',
      statusHistory: newHistory,
      documentReviews: documentReviews || {},
      updatedAt: now,
      adminVerifiedByAdminId: adminId,
      adminVerifiedAt: now,
    };

    if (documentReviews) {
      for (const [docId, docStatus] of Object.entries(documentReviews)) {
        await this.submissionRepo.updateDocumentStatus(docId, docStatus === 'approved' ? 'APPROVED' : 'REJECTED');
      }
    }

    if (status === 'APPROVED') {
      updateData.letterNumber = normalizedLetterNumber || null;
      updateData.adminVerificationStatus = 'APPROVED';
      updateData.adminRejectionReason = null;
      updateData.dosenVerificationStatus = 'PENDING';
      updateData.dosenVerifiedAt = null;
      updateData.dosenVerifiedByDosenId = null;
      updateData.dosenRejectionReason = null;
      updateData.workflowStage = 'PENDING_DOSEN_VERIFICATION';
      updateData.finalSignedFileUrl = null;
    } else {
      updateData.rejectionReason = rejectionReason;
      updateData.adminVerificationStatus = 'REJECTED';
      updateData.adminRejectionReason = rejectionReason;
      updateData.dosenVerificationStatus = 'PENDING';
      updateData.dosenVerifiedAt = null;
      updateData.dosenVerifiedByDosenId = null;
      updateData.dosenRejectionReason = null;
      updateData.workflowStage = 'REJECTED_ADMIN';
      updateData.finalSignedFileUrl = null;
    }

    const updated = await this.submissionRepo.update(submissionId, updateData);
    if (!updated) throw new Error('Failed to update submission status');
    return updated;
  }

  async approveSubmission(submissionId: string, adminId: string, documentReviews?: Record<string, string>, letterNumber?: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) throw new Error('Submission not found');
    if (this.getCurrentStage(submission) !== 'PENDING_ADMIN_REVIEW') throw new Error('Can only approve pending submissions');

    const docs = await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
    const normalizedDocumentReviews = documentReviews && Object.keys(documentReviews).length > 0 ? documentReviews : docs.reduce<Record<string, string>>((acc, doc) => { acc[doc.id] = 'approved'; return acc; }, {});

    return await this.updateSubmissionStatus(submissionId, adminId, 'APPROVED', undefined, normalizedDocumentReviews, letterNumber);
  }

  async rejectSubmission(submissionId: string, adminId: string, reason: string, documentReviews?: Record<string, string>) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) throw new Error('Submission not found');
    if (this.getCurrentStage(submission) !== 'PENDING_ADMIN_REVIEW') throw new Error('Can only reject pending submissions');

    const docs = await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
    const normalizedDocumentReviews = documentReviews && Object.keys(documentReviews).length > 0 ? documentReviews : docs.reduce<Record<string, string>>((acc, doc, i) => { acc[doc.id] = i === 0 ? 'rejected' : 'approved'; return acc; }, {});

    return await this.updateSubmissionStatus(submissionId, adminId, 'REJECTED', reason, normalizedDocumentReviews);
  }

  async generateLetterForSubmission(submissionId: string, adminId: string, format: 'pdf' | 'docx' = 'pdf') {
    if (!this.letterService) throw new Error('Letter service not configured');
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) throw new Error('Submission not found');
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
