import { SubmissionRepository } from '@/repositories/submission.repository';
import { ResponseLetterRepository } from '@/repositories/response-letter.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { TemplateRepository } from '@/repositories/template.repository';
import { LetterService } from './letter.service';
import { AuthService } from './auth.service';
import { DosenService } from './dosen.service';
import { MahasiswaService } from './mahasiswa.service';
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
  private authService: AuthService;
  private dosenService: DosenService;
  private mahasiswaService: MahasiswaService;

  constructor(
    private env: CloudflareBindings
  ) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.letterService = new LetterService(this.env);
    this.dosenService = new DosenService(this.env);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.submissionRepo = new SubmissionRepository(db);
    this.responseLetterRepo = new ResponseLetterRepository(db);
    this.teamRepo = new TeamRepository(db);
    this.templateRepo = new TemplateRepository(db);
    this.authService = new AuthService(this.env);
  }

  private normalizeIdentityName(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async buildStudentIdentityMap(
    submission: SubmissionLike & { team?: { members?: Array<{ user?: { id?: string | null } | null }> } | null | undefined },
    sessionId: string,
  ) {
    const ids = new Set<string>();

    submission.team?.members?.forEach((member) => {
      const memberId = member.user?.id;
      if (memberId) ids.add(memberId);
    });

    return await Promise.all(
      Array.from(ids).map(async (id) => {
        const mahasiswa = await this.mahasiswaService.getMahasiswaById(id, sessionId);
        return [
          id,
          {
            id,
            name: mahasiswa?.profile.fullName || null,
            nim: mahasiswa?.nim || null,
            prodi: mahasiswa?.prodi?.nama || null,
          },
        ] as const;
      }),
    ).then((entries) => new Map(entries));
  }

  private async enrichSubmissionForAdmin(
    submission: SubmissionLike & {
      team?: {
        id: string;
        code: string;
        leaderMahasiswaId: string;
        dosenKpId?: string | null;
        dosenKpName?: string | null;
        academicSupervisor?: string | null;
        status: 'PENDING' | 'FIXED';
        members?: Array<{
          id: string;
          user?: { id?: string | null; name?: string | null; email?: string | null; nim?: string | null; prodi?: string | null };
          role?: string | null;
          status?: string | null;
        }>;
      } | null;
      documents?: Array<{
        id: string;
        uploadedByMahasiswaId: string;
        uploadedByUser?: { id: string; name: string | null; email: string | null; nim: string | null; prodi: string | null };
      }>;
    },
    sessionId: string,
  ) {
    if (!submission.team) {
      return submission;
    }

    const team = submission.team;
    const [dosenDetail, studentMap] = await Promise.all([
      team.dosenKpId
        ? this.dosenService.getDosenById(team.dosenKpId, sessionId)
        : Promise.resolve(null),
      this.buildStudentIdentityMap(submission, sessionId),
    ]);

    const dosenName = this.normalizeIdentityName(dosenDetail?.profile.fullName) ||
      this.normalizeIdentityName(team.dosenKpName) ||
      this.normalizeIdentityName(team.academicSupervisor) ||
      null;

    const enrichedMembers = (team.members || []).map((member) => {
      const memberId = member.user?.id;
      const identity = memberId ? studentMap.get(memberId) : undefined;

      return {
        ...member,
        user: {
          id: memberId || member.id,
          name: identity?.name || member.user?.name || null,
          email: member.user?.email || null,
          nim: identity?.nim || member.user?.nim || null,
          prodi: identity?.prodi || member.user?.prodi || null,
        },
      };
    });

    const enrichedDocuments = (submission.documents || []).map((doc) => {
      const identity = studentMap.get(doc.uploadedByMahasiswaId);
      return {
        ...doc,
        uploadedByUser: {
          id: doc.uploadedByMahasiswaId,
          name: identity?.name || null,
          email: null,
          nim: identity?.nim || null,
          prodi: identity?.prodi || null,
        },
      };
    });

    return {
      ...submission,
      team: {
        ...team,
        dosenKpName: dosenName,
        academicSupervisor: dosenName,
        members: enrichedMembers,
      },
      documents: enrichedDocuments,
    };
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

  async getDashboard(sessionId: string): Promise<AdminDashboardPayload> {
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
      mahasiswaAktifSemester4
    ] = await Promise.all([
      this.responseLetterRepo.countApproved(),
      this.teamRepo.countFixedTeams(),
      this.submissionRepo.findAllForAdmin(),
      this.responseLetterRepo.countApprovedAndVerified(),
      this.teamRepo.countDistinctDosenKpInFixedTeams(),
      this.templateRepo.countAll(),
      this.submissionRepo.findAll(),
      this.fetchMahasiswaCountBySemester(4, sessionId),
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

  private async fetchMahasiswaCountBySemester(semester: number, sessionId: string): Promise<number> {
    try {
      const token = await this.authService.getSessionAccessToken(sessionId);
      const baseUrl = this.env.SSO_BASE_URL;
      const url = `${baseUrl}/api/integrations/profile-service/mahasiswa/count-by-semester/${semester}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[AdminService.fetchMahasiswaCountBySemester] Failed to fetch count from SSO: ${response.status}`);
        return 0;
      }

      const payload = await response.json() as { success: boolean; data: { count: number } };
      return payload.data.count;
    } catch (error) {
      console.error(`[AdminService.fetchMahasiswaCountBySemester] Error:`, error);
      return 0;
    }
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

  async getAllSubmissions(sessionId: string) {
    const submissions = await this.submissionRepo.findAllForAdmin();
    return await Promise.all(
      submissions.map((submission) => this.enrichSubmissionForAdmin(submission, sessionId)),
    );
  }

  async getSubmissionsByStatus(
    status: 'DRAFT' | 'PENDING_REVIEW' | 'REJECTED' | 'APPROVED',
    sessionId: string,
  ) {
    const submissions = await this.submissionRepo.findAllForAdmin();
    const filtered = submissions.filter((submission) => this.matchesStatusBucket(submission, status));
    return await Promise.all(
      filtered.map((submission) => this.enrichSubmissionForAdmin(submission, sessionId)),
    );
  }

  async getSubmissionById(id: string, sessionId: string) {
    const submission = await this.submissionRepo.findByIdWithTeam(id);
    if (!submission) throw new Error('Submission not found');
    const letters = await this.submissionRepo.findLettersBySubmissionId(id);
    const enriched = await this.enrichSubmissionForAdmin(
      {
        ...submission,
        documents: submission.documents,
      },
      sessionId,
    );

    return {
      ...enriched,
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
