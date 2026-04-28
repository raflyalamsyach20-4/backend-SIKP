import { createDbClient } from '@/db';
import { TeamRepository } from '@/repositories/team.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { ResponseLetterRepository } from '@/repositories/response-letter.repository';
import { StorageService } from '@/services/storage.service';
import { AuthService } from './auth.service';
import { DosenService } from './dosen.service';
import type { SsoMahasiswaDetail, SsoMahasiswaResponse, SsoMahasiswaSearchResponse } from '@/types';

type TeamRecord = NonNullable<Awaited<ReturnType<TeamRepository['findById']>>>;
type SubmissionRecord = NonNullable<Awaited<ReturnType<SubmissionRepository['findById']>>>;
type ResponseLetterRecord = NonNullable<Awaited<ReturnType<ResponseLetterRepository['findBySubmissionId']>>>;

type DashboardPayload = {
  kerjaPraktik: {
    code: 'not_started' | 'on_going' | 'finished';
    label: string;
    description: string;
  };
  hariTersisa: number | null;
  tahapBerikutnya: {
    title: string;
    description: string;
    actionLabel?: string;
    actionUrl?: string;
  };
  statusPengajuan: {
    code: 'draft' | 'pending_review' | 'approved' | 'rejected';
    submitted: boolean;
    label: string;
    description?: string;
  };
  teamInfo: {
    teamId: string;
    teamName: string;
    members: Array<{ name: string; nim: string | null; role: string }>;
    mentorName: string | null;
    mentorEmail: string | null;
    dosenName: string | null;
    dosenNip: string | null;
  } | null;
  activities: Array<{ action: string; time: string; status: string }>;
};

export class MahasiswaService {
  private teamRepository: TeamRepository;
  private submissionRepository: SubmissionRepository;
  private responseLetterRepository: ResponseLetterRepository;
  private storageService: StorageService;
  private authService: AuthService;
  
  private _dosenService?: DosenService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.teamRepository = new TeamRepository(db);
    this.submissionRepository = new SubmissionRepository(db);
    this.responseLetterRepository = new ResponseLetterRepository(db);
    this.storageService = new StorageService(this.env);
    this.authService = new AuthService(this.env);
  }

  private get dosenService(): DosenService {
    if (!this._dosenService) {
      this._dosenService = new DosenService(this.env);
    }
    return this._dosenService;
  }

  /**
   * Fetch Mahasiswa detail from SSO by ID
   */
  async getMahasiswaById(mahasiswaId: string, sessionId: string): Promise<SsoMahasiswaDetail | null> {
    try {
      const token = await this.authService.getSessionAccessToken(sessionId);
      const baseUrl = this.env.SSO_BASE_URL;
      const url = `${baseUrl}/api/mahasiswa/${mahasiswaId}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[MahasiswaService.getMahasiswaById] Mahasiswa ID ${mahasiswaId} not found in SSO`);
          return null;
        }
        throw new Error(`Failed to fetch mahasiswa from SSO (${response.status})`);
      }

      const payload = (await response.json()) as SsoMahasiswaResponse;
      return payload.data;
    } catch (error) {
      console.error(`[MahasiswaService.getMahasiswaById] Error fetching from SSO:`, error);
      return null;
    }
  }

  /**
   * Fetch Mahasiswa detail from SSO by NIM
   */
  async getMahasiswaByNim(nim: string, sessionId: string): Promise<SsoMahasiswaDetail | null> {
    try {
      const token = await this.authService.getSessionAccessToken(sessionId);
      const baseUrl = this.env.SSO_BASE_URL;
      const url = `${baseUrl}/api/mahasiswa/nim/${nim}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[MahasiswaService.getMahasiswaByNim] Mahasiswa NIM ${nim} not found in SSO`);
          return null;
        }
        throw new Error(`Failed to fetch mahasiswa from SSO (${response.status})`);
      }

      const payload = (await response.json()) as SsoMahasiswaResponse;
      return payload.data;
    } catch (error) {
      console.error(`[MahasiswaService.getMahasiswaByNim] Error fetching from SSO:`, error);
      return null;
    }
  }

  private normalizeDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private toDateOnly(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private formatDate(value: Date): string {
    return value.toISOString().split('T')[0];
  }

  private async resolvePrimaryTeam(mahasiswaId: string): Promise<TeamRecord | null> {
    const memberTeams = await this.teamRepository.findTeamsByMahasiswaId(mahasiswaId);
    const leaderTeams = await this.teamRepository.findByLeaderMahasiswaId(mahasiswaId);

    const allTeamsMap = new Map<string, TeamRecord>();
    [...memberTeams, ...leaderTeams].forEach((team) => {
      if (team && !allTeamsMap.has(team.id)) {
        allTeamsMap.set(team.id, team as TeamRecord);
      }
    });

    const allTeams = Array.from(allTeamsMap.values()).sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === 'FIXED' ? -1 : 1;
    });

    if (allTeams.length === 0) return null;

    for (const team of allTeams) {
      const submissions = await this.submissionRepository.findByTeamId(team.id);
      if (submissions.length > 0) return team;
    }

    return allTeams[0];
  }

  private async resolveCurrentSubmission(teamId: string): Promise<SubmissionRecord | null> {
    const submissions = await this.submissionRepository.findByTeamId(teamId);
    if (submissions.length === 0) return null;

    const ordered = [...submissions].sort((a, b) => {
      const aDate = this.normalizeDate(a.updatedAt || a.createdAt)?.getTime() || 0;
      const bDate = this.normalizeDate(b.updatedAt || b.createdAt)?.getTime() || 0;
      return bDate - aDate;
    });

    return ordered[0] as SubmissionRecord;
  }

  private resolveKerjaPraktik(submission: SubmissionRecord | null) {
    if (!submission) {
      return {
        code: 'not_started' as const,
        label: 'Belum Dimulai',
        description: 'Segera lakukan pengajuan kerja praktik.',
      };
    }

    const startDate = this.normalizeDate(submission.startDate);
    const endDate = this.normalizeDate(submission.endDate);

    if (!startDate || !endDate) {
      return {
        code: 'not_started' as const,
        label: 'Belum Dimulai',
        description: 'Tanggal pelaksanaan kerja praktik belum diisi.',
      };
    }

    const today = this.toDateOnly(new Date());
    const start = this.toDateOnly(startDate);
    const end = this.toDateOnly(endDate);

    if (today > end) {
      return {
        code: 'finished' as const,
        label: 'Selesai',
        description: `Periode: ${this.formatDate(start)} - ${this.formatDate(end)}`,
      };
    }

    if (today >= start && today <= end) {
      return {
        code: 'on_going' as const,
        label: 'Sedang Berlangsung',
        description: `Periode: ${this.formatDate(start)} - ${this.formatDate(end)}`,
      };
    }

    return {
      code: 'not_started' as const,
      label: 'Belum Dimulai',
      description: `Periode dimulai pada ${this.formatDate(start)}.`,
    };
  }

  private resolveHariTersisa(submission: SubmissionRecord | null): number | null {
    if (!submission) return null;

    const endDate = this.normalizeDate(submission.endDate);
    if (!endDate) return null;

    const today = this.toDateOnly(new Date());
    const end = this.toDateOnly(endDate);
    const msInDay = 24 * 60 * 60 * 1000;
    const daysRemaining = Math.floor((end.getTime() - today.getTime()) / msInDay);
    return daysRemaining < 0 ? 0 : daysRemaining;
  }

  private resolveStatusPengajuan(submission: SubmissionRecord | null) {
    if (!submission || submission.status === 'DRAFT') {
      return {
        code: 'draft' as const,
        submitted: false,
        label: 'Segera lakukan pengajuan',
      };
    }

    const workflowStage = submission.workflowStage;

    if (
      submission.status === 'REJECTED' ||
      workflowStage === 'REJECTED_ADMIN' ||
      workflowStage === 'REJECTED_DOSEN'
    ) {
      return {
        code: 'rejected' as const,
        submitted: true,
        label: 'Pengajuan ditolak. Lihat alasannya.',
        description: submission.rejectionReason || undefined,
      };
    }

    if (submission.status === 'PENDING_REVIEW' || workflowStage === 'PENDING_ADMIN_REVIEW' || workflowStage === 'PENDING_DOSEN_VERIFICATION') {
      return {
        code: 'pending_review' as const,
        submitted: true,
        label: 'Pengajuan telah dilakukan',
        description: submission.submittedAt
          ? `Waktu submit: ${this.formatDate(this.normalizeDate(submission.submittedAt) || new Date())}`
          : undefined,
      };
    }

    if (submission.status === 'APPROVED' || workflowStage === 'COMPLETED') {
      return {
        code: 'approved' as const,
        submitted: true,
        label: 'Pengajuan Surat Pengantar disetujui.',
      };
    }

    return {
      code: 'pending_review' as const,
      submitted: true,
      label: 'Pengajuan telah dilakukan',
    };
  }

  private resolveTahapBerikutnya(
    team: TeamRecord | null,
    submission: SubmissionRecord | null,
    responseLetter: ResponseLetterRecord | null
  ) {
    if (!team || team.status === 'PENDING' || !submission) {
      return {
        title: 'Finalisasi Tim',
        description: 'Tim Anda belum final. Selesaikan pembentukan tim terlebih dahulu.',
        actionLabel: 'Ke Buat Tim',
        actionUrl: '/mahasiswa/kp/buat-tim',
      };
    }

    if (submission.status === 'DRAFT') {
      return {
        title: 'Lengkapi Pengajuan',
        description: 'Lengkapi data pengajuan agar proses KP dapat dilanjutkan.',
        actionLabel: 'Ke Pengajuan',
        actionUrl: '/mahasiswa/kp/pengajuan',
      };
    }

    if (
      submission.status === 'PENDING_REVIEW' ||
      submission.workflowStage === 'PENDING_ADMIN_REVIEW' ||
      submission.workflowStage === 'PENDING_DOSEN_VERIFICATION'
    ) {
      return {
        title: 'Menunggu review pengajuan',
        description: 'Pengajuan Anda sedang direview. Silakan tunggu hasil verifikasi.',
        actionLabel: 'Lihat Pengajuan',
        actionUrl: '/mahasiswa/kp/pengajuan',
      };
    }

    if (responseLetter?.verified && responseLetter.letterStatus === 'rejected') {
      return {
        title: 'Mulai ulang dari bentuk tim',
        description: 'Surat balasan ditolak. Silakan mulai ulang proses dari pembentukan tim.',
        actionLabel: 'Ke Buat Tim',
        actionUrl: '/mahasiswa/kp/buat-tim',
      };
    }

    if (responseLetter?.verified && responseLetter.letterStatus === 'approved') {
      return {
        title: 'Pelaksanaan kerja praktik',
        description: 'Surat balasan telah disetujui. Lanjutkan pelaksanaan kerja praktik.',
        actionLabel: 'Ke Saat Magang',
        actionUrl: '/mahasiswa/kp/saat-magang',
      };
    }

    if ((submission.workflowStage === 'COMPLETED' || submission.status === 'APPROVED') && !responseLetter) {
      return {
        title: 'Upload surat balasan',
        description: 'Unggah surat balasan dari perusahaan untuk melanjutkan proses.',
        actionLabel: 'Ke Surat Balasan',
        actionUrl: '/mahasiswa/kp/surat-balasan',
      };
    }

    if ((responseLetter && !responseLetter.verified) || submission.responseLetterStatus === 'submitted') {
      return {
        title: 'Menunggu pemverifikasian surat balasan',
        description: 'Surat balasan sudah dikirim and sedang menunggu verifikasi.',
        actionLabel: 'Lihat Surat Balasan',
        actionUrl: '/mahasiswa/kp/surat-balasan',
      };
    }

    return {
      title: 'Pelaksanaan kerja praktik',
      description: 'Lanjutkan aktivitas kerja praktik sesuai timeline.',
      actionLabel: 'Ke Saat Magang',
      actionUrl: '/mahasiswa/kp/saat-magang',
    };
  }

  private async resolveTeamInfo(team: TeamRecord | null, sessionId: string): Promise<DashboardPayload['teamInfo']> {
    if (!team) return null;

    const members = await this.teamRepository.findMembersByTeamId(team.id);
    const acceptedMembers = members.filter((m) => m.invitationStatus === 'ACCEPTED');

    const enrichedMembers = await Promise.all(
      acceptedMembers.map(async (m) => {
        const student = await this.getMahasiswaById(m.mahasiswaId, sessionId);
        return {
          name: student?.profile.fullName || 'Tanpa Nama',
          nim: student?.nim || null,
          role: m.role === 'KETUA' ? 'Ketua' : 'Anggota',
        };
      })
    );

    const dosenSsoData = team.dosenKpId ? await this.dosenService.getDosenById(team.dosenKpId, sessionId) : null;

    return {
      teamId: team.id,
      teamName: team.code,
      members: enrichedMembers,
      mentorName: null,
      mentorEmail: null,
      dosenName: dosenSsoData?.profile.fullName || null,
      dosenNip: dosenSsoData?.nidn || null,
    };
  }

  async getDashboard(mahasiswaId: string, sessionId: string): Promise<DashboardPayload> {
    const team = await this.resolvePrimaryTeam(mahasiswaId);
    const submission = team ? await this.resolveCurrentSubmission(team.id) : null;
    const responseLetter = submission
      ? await this.responseLetterRepository.findBySubmissionId(submission.id)
      : null;

    return {
      kerjaPraktik: this.resolveKerjaPraktik(submission),
      hariTersisa: this.resolveHariTersisa(submission),
      tahapBerikutnya: this.resolveTahapBerikutnya(team, submission, responseLetter),
      statusPengajuan: this.resolveStatusPengajuan(submission),
      teamInfo: await this.resolveTeamInfo(team, sessionId),
      activities: [],
    };
  }

  /**
   * Search Mahasiswa from SSO
   */
  async searchMahasiswa(params: {
    search?: string;
    prodiId?: string | null;
    fakultasId?: string | null;
    page?: string;
    limit?: string;
  }, sessionId: string): Promise<SsoMahasiswaSearchResponse> {
    try {
      const token = await this.authService.getSessionAccessToken(sessionId);
      const baseUrl = this.env.SSO_BASE_URL;
      
      // Use URL constructor for safe parameter appending
      const url = new URL(`${baseUrl}/api/mahasiswa`);
      
      if (params.search) url.searchParams.set('search', params.search);
      if (params.prodiId) url.searchParams.set('prodiId', params.prodiId);
      if (params.fakultasId) url.searchParams.set('fakultasId', params.fakultasId);
      if (params.page) url.searchParams.set('page', params.page);
      if (params.limit) url.searchParams.set('limit', params.limit);

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to search mahasiswa from SSO (${response.status})`);
      }

      return await response.json() as SsoMahasiswaSearchResponse;
    } catch (error) {
      console.error(`[MahasiswaService.searchMahasiswa] Error fetching from SSO:`, error);
      throw error;
    }
  }
}
