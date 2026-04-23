import { UserRepository } from '@/repositories/user.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { ResponseLetterRepository } from '@/repositories/response-letter.repository';
import { StorageService } from '@/services/storage.service';

const MAX_SIGNATURE_SIZE_MB = 2;
const ALLOWED_SIGNATURE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

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
  constructor(
    private userRepository: UserRepository,
    private storageService: StorageService,
    private teamRepository: TeamRepository,
    private submissionRepository: SubmissionRepository,
    private responseLetterRepository: ResponseLetterRepository
  ) {}

  private normalizeDate(value: string | Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  private toDateOnly(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private formatDate(value: Date): string {
    return value.toISOString().split('T')[0];
  }

  private async resolvePrimaryTeam(userId: string): Promise<TeamRecord | null> {
    const memberTeams = await this.teamRepository.findTeamsByMemberId(userId);
    const leaderTeams = await this.teamRepository.findByLeaderId(userId);

    const allTeamsMap = new Map<string, TeamRecord>();
    [...memberTeams, ...leaderTeams].forEach((team) => {
      if (team && !allTeamsMap.has(team.id)) {
        allTeamsMap.set(team.id, team as TeamRecord);
      }
    });

    const allTeams = Array.from(allTeamsMap.values()).sort((a, b) => {
      if (a.status === b.status) {
        return 0;
      }
      return a.status === 'FIXED' ? -1 : 1;
    });

    if (allTeams.length === 0) {
      return null;
    }

    for (const team of allTeams) {
      const submissions = await this.submissionRepository.findByTeamId(team.id);
      if (submissions.length > 0) {
        return team;
      }
    }

    return allTeams[0];
  }

  private async resolveCurrentSubmission(teamId: string): Promise<SubmissionRecord | null> {
    const submissions = await this.submissionRepository.findByTeamId(teamId);
    if (submissions.length === 0) {
      return null;
    }

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
    if (!submission) {
      return null;
    }

    const endDate = this.normalizeDate(submission.endDate);
    if (!endDate) {
      return null;
    }

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
        description: 'Surat balasan sudah dikirim dan sedang menunggu verifikasi.',
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

  private async resolveTeamInfo(team: TeamRecord | null): Promise<DashboardPayload['teamInfo']> {
    if (!team) {
      return null;
    }

    const members = await this.teamRepository.findMembersWithUserDataByTeamId(team.id);
    const acceptedMembers = members.filter((member) => member.invitationStatus === 'ACCEPTED');

    const dosenKp = team.dosenKpId ? await this.userRepository.findDosenByUserId(team.dosenKpId) : null;
    const dosenUser = team.dosenKpId ? await this.userRepository.findById(team.dosenKpId) : null;

    return {
      teamId: team.id,
      teamName: team.code,
      members: acceptedMembers.map((member) => ({
        name: member.user.nama || 'Tanpa Nama',
        nim: member.user.nim || null,
        role: member.role === 'KETUA' ? 'Ketua' : 'Anggota',
      })),
      mentorName: null,
      mentorEmail: null,
      dosenName: dosenUser?.nama || null,
      dosenNip: dosenKp?.nip || null,
    };
  }

  async getDashboard(userId: string): Promise<DashboardPayload> {
    const team = await this.resolvePrimaryTeam(userId);
    const submission = team ? await this.resolveCurrentSubmission(team.id) : null;
    const responseLetter = submission
      ? await this.responseLetterRepository.findBySubmissionId(submission.id)
      : null;

    return {
      kerjaPraktik: this.resolveKerjaPraktik(submission),
      hariTersisa: this.resolveHariTersisa(submission),
      tahapBerikutnya: this.resolveTahapBerikutnya(team, submission, responseLetter),
      statusPengajuan: this.resolveStatusPengajuan(submission),
      teamInfo: await this.resolveTeamInfo(team),
      activities: [],
    };
  }

  async getMe(userId: string) {
    const profile = await this.userRepository.getMahasiswaMe(userId);
    if (!profile) {
      const notFound: Error = new Error('Mahasiswa profile not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    return profile;
  }

  async updateProfile(
    userId: string,
    data: {
      nama?: string;
      email?: string;
      phone?: string;
      fakultas?: string | null;
      prodi?: string | null;
      semester?: number | null;
      jumlahSksSelesai?: number | null;
      angkatan?: string | null;
    }
  ) {
    // Verify profile exists
    const profile = await this.getMe(userId);

    // Validate email uniqueness if email is being updated
    if (data.email && data.email !== profile.email) {
      const existingEmail = await this.userRepository.findByEmail(data.email);
      if (existingEmail && existingEmail.id !== userId) {
        const emailExists: Error = new Error('Email already in use');
        emailExists.statusCode = 400;
        throw emailExists;
      }
    }

    // Prepare update data for users table
    const usersUpdateData: Record<string, unknown> = {};
    if (data.nama !== undefined) usersUpdateData.nama = data.nama;
    if (data.email !== undefined) usersUpdateData.email = data.email;
    if (data.phone !== undefined) usersUpdateData.phone = data.phone;

    // Prepare update data for mahasiswa table
    const mahasiswaUpdateData: Record<string, unknown> = {};
    if (data.fakultas !== undefined) mahasiswaUpdateData.fakultas = data.fakultas;
    if (data.prodi !== undefined) mahasiswaUpdateData.prodi = data.prodi;
    if (data.semester !== undefined) mahasiswaUpdateData.semester = data.semester;
    if (data.jumlahSksSelesai !== undefined) mahasiswaUpdateData.jumlahSksSelesai = data.jumlahSksSelesai;
    if (data.angkatan !== undefined) mahasiswaUpdateData.angkatan = data.angkatan;

    try {
      if (Object.keys(usersUpdateData).length > 0) {
        await this.userRepository.update(userId, usersUpdateData);
      }

      if (Object.keys(mahasiswaUpdateData).length > 0) {
        await this.userRepository.updateMahasiswaByUserId(userId, mahasiswaUpdateData);
      }

      return await this.getMe(userId);
    } catch (error) {
      console.error('[MahasiswaService.updateProfile] Failed to update profile:', error);
      throw error;
    }
  }

  async updateESignature(userId: string, signatureFile: File) {
    const profile = await this.getMe(userId);

    if (!ALLOWED_SIGNATURE_MIME_TYPES.includes(signatureFile.type)) {
      const invalidType: Error = new Error('Invalid file type. Only PNG, JPG, and JPEG are allowed');
      invalidType.statusCode = 400;
      throw invalidType;
    }

    if (!this.storageService.validateFileSize(signatureFile.size, MAX_SIGNATURE_SIZE_MB)) {
      const invalidSize: Error = new Error('File size exceeds 2MB limit');
      invalidSize.statusCode = 400;
      throw invalidSize;
    }

    const fallbackName = `esignature-${Date.now()}.png`;
    const sourceFileName = signatureFile.name && signatureFile.name.trim() ? signatureFile.name : fallbackName;
    const uniqueFileName = this.storageService.generateUniqueFileName(sourceFileName);

    let uploadResult: { url: string; key: string };
    try {
      uploadResult = await this.storageService.uploadFile(
        signatureFile,
        uniqueFileName,
        `esignatures/${userId}`,
        signatureFile.type
      );
    } catch (error) {
      console.error('[MahasiswaService.updateESignature] Upload to R2 failed:', error);
      throw error;
    }

    const { url, key } = uploadResult;

    try {
      const updated = await this.userRepository.updateMahasiswaByUserId(userId, {
        esignatureUrl: url,
        esignatureKey: key,
        esignatureUploadedAt: new Date(),
      });

      if (!updated) {
        await this.storageService.deleteFile(key);
        const updateFailed: Error = new Error('Failed to update e-signature metadata');
        updateFailed.statusCode = 500;
        throw updateFailed;
      }

      if (profile.esignatureKey && profile.esignatureKey !== key) {
        try {
          await this.storageService.deleteFile(profile.esignatureKey);
        } catch (error) {
          console.warn('[MahasiswaService.updateESignature] Failed to delete old signature from R2:', error);
        }
      }

      return {
        url,
        key,
        uploadedAt: updated.esignatureUploadedAt,
      };
    } catch (error) {
      console.error('[MahasiswaService.updateESignature] Failed to update e-signature:', error);
      throw error;
    }
  }

  async deleteESignature(userId: string) {
    const profile = await this.getMe(userId);

    const oldKey = profile.esignatureKey;

    const updated = await this.userRepository.updateMahasiswaByUserId(userId, {
      esignatureUrl: null,
      esignatureKey: null,
      esignatureUploadedAt: null,
    });

    if (!updated) {
      const updateFailed: Error = new Error('Failed to clear e-signature metadata');
      updateFailed.statusCode = 500;
      console.error('[MahasiswaService.deleteESignature] Failed to update database while deleting signature metadata');
      throw updateFailed;
    }

    if (oldKey) {
      try {
        await this.storageService.deleteFile(oldKey);
      } catch (error) {
        console.warn('[MahasiswaService.deleteESignature] Failed to delete signature from R2:', error);
      }
    }

    return { deleted: true };
  }
}
