import { UserRepository } from '@/repositories/user.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { SuratKesediaanRepository } from '@/repositories/surat-kesediaan.repository';
import { SuratPermohonanRepository } from '@/repositories/surat-permohonan.repository';
import { StorageService } from '@/services/storage.service';
import { SuratPengantarDosenService } from '@/services/surat-pengantar-dosen.service';
import type { UserRole } from '@/types';

const MAX_SIGNATURE_SIZE_MB = 2;
const ALLOWED_SIGNATURE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

type DashboardActivity = {
  action: string;
  time: string;
  status: 'success' | 'info';
};

type DosenDashboardPayload = {
  totalMahasiswaBimbingan: number;
  totalSuratAjuanMasuk: number;
  activities: DashboardActivity[];
};

type WakdekDashboardPayload = {
  totalAjuanSuratPengantarMasuk: number;
  activities: DashboardActivity[];
};

type VerifierQueueItem = {
  isAdminApproved?: boolean;
  adminVerificationStatus?: string;
  admin_status?: string;
  adminStatus?: string;
  submissionStatus?: string;
  submission_status?: string;
};

export class DosenService {
  constructor(
    private userRepository: UserRepository,
    private storageService: StorageService,
    private teamRepository: TeamRepository,
    private suratKesediaanRepository: SuratKesediaanRepository,
    private suratPermohonanRepository: SuratPermohonanRepository,
    private suratPengantarDosenService: SuratPengantarDosenService
  ) {}

  private isWakilDekanAcademic(jabatan?: string | null): boolean {
    return (jabatan || '').toLowerCase().includes('wakil dekan');
  }

  private isAdminApprovedForVerifierQueue(item: unknown): boolean {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const queueItem = item as VerifierQueueItem;

    if (typeof queueItem.isAdminApproved === 'boolean') {
      return queueItem.isAdminApproved;
    }

    const statusCandidates = [
      queueItem.adminVerificationStatus,
      queueItem.admin_status,
      queueItem.adminStatus,
      queueItem.submissionStatus,
      queueItem.submission_status,
    ]
      .filter((value): value is string => typeof value === 'string')
      .map((value: string) => value.trim().toUpperCase());

    return statusCandidates.includes('APPROVED') || statusCandidates.includes('DISETUJUI');
  }

  private async countTotalSuratPengantarMasuk(userId: string, role: UserRole): Promise<number> {
    const requests = await this.suratPengantarDosenService.getRequestsForVerifier(userId, role);
    return requests.filter((item) => this.isAdminApprovedForVerifierQueue(item)).length;
  }

  private async countMahasiswaBimbingan(dosenUserId: string): Promise<number> {
    const supervisedTeams = await this.teamRepository.findByDosenKpId(dosenUserId);
    if (supervisedTeams.length === 0) {
      return 0;
    }

    const uniqueMahasiswaIds = new Set<string>();
    const teamIds = supervisedTeams.map((team) => team.id);

    supervisedTeams.forEach((team) => {
      if (team.leaderId) {
        uniqueMahasiswaIds.add(team.leaderId);
      }
    });

    const acceptedMembers = await this.teamRepository.findAcceptedMembersByTeamIds(teamIds);
    acceptedMembers.forEach((member) => {
      if (member.userId) {
        uniqueMahasiswaIds.add(member.userId);
      }
    });

    return uniqueMahasiswaIds.size;
  }

  private async countTotalSuratMasuk(dosenUserId: string): Promise<number> {
    const [kesediaan, permohonan] = await Promise.all([
      this.suratKesediaanRepository.findByDosenIdWithDetails(dosenUserId),
      this.suratPermohonanRepository.findByDosenIdWithDetails(dosenUserId),
    ]);

    return kesediaan.length + permohonan.length;
  }

  async getDashboard(userId: string): Promise<DosenDashboardPayload> {
    const [totalMahasiswaBimbingan, totalSuratAjuanMasuk] = await Promise.all([
      this.countMahasiswaBimbingan(userId),
      this.countTotalSuratMasuk(userId),
    ]);

    return {
      totalMahasiswaBimbingan,
      totalSuratAjuanMasuk,
      activities: [],
    };
  }

  async getWakdekDashboard(userId: string, role: UserRole): Promise<WakdekDashboardPayload> {
    const profile = await this.getMe(userId);
    if (!this.isWakilDekanAcademic(profile.jabatan)) {
      const forbidden: Error = new Error('Dashboard ini khusus wakil dekan bidang akademik.');
      forbidden.statusCode = 403;
      throw forbidden;
    }

    const totalAjuanSuratPengantarMasuk = await this.countTotalSuratPengantarMasuk(userId, role);

    return {
      totalAjuanSuratPengantarMasuk,
      activities: [],
    };
  }

  async getMe(userId: string) {
    const profile = await this.userRepository.getDosenMe(userId);
    if (!profile) {
      const notFound: Error = new Error('Dosen profile not found');
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
      jabatan?: string | null;
      fakultas?: string | null;
      prodi?: string | null;
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

    // Prepare update data for dosen table
    const dosenUpdateData: Record<string, unknown> = {};
    if (data.jabatan !== undefined) dosenUpdateData.jabatan = data.jabatan;
    if (data.fakultas !== undefined) dosenUpdateData.fakultas = data.fakultas;
    if (data.prodi !== undefined) dosenUpdateData.prodi = data.prodi;

    try {
      // Update users table if there's data to update
      if (Object.keys(usersUpdateData).length > 0) {
        await this.userRepository.update(userId, usersUpdateData);
      }

      // Update dosen table if there's data to update
      if (Object.keys(dosenUpdateData).length > 0) {
        await this.userRepository.updateDosenByUserId(userId, dosenUpdateData);
      }

      // Fetch and return updated profile
      const updatedProfile = await this.getMe(userId);
      return updatedProfile;
    } catch (error) {
      console.error('[DosenService.updateProfile] Failed to update profile:', error);
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
      console.error('[DosenService.updateESignature] Upload to R2 failed:', error);
      throw error;
    }

    const { url, key } = uploadResult;

    try {
      const updated = await this.userRepository.updateDosenByUserId(userId, {
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
          console.warn('[DosenService.updateESignature] Failed to delete old signature from R2:', error);
        }
      }

      return {
        url,
        key,
        uploadedAt: updated.esignatureUploadedAt,
      };
    } catch (error) {
      console.error('[DosenService.updateESignature] Failed to update e-signature:', error);
      throw error;
    }
  }

  async deleteESignature(userId: string) {
    const profile = await this.getMe(userId);

    const oldKey = profile.esignatureKey;

    const updated = await this.userRepository.updateDosenByUserId(userId, {
      esignatureUrl: null,
      esignatureKey: null,
      esignatureUploadedAt: null,
    });

    if (!updated) {
      const updateFailed: Error = new Error('Failed to clear e-signature metadata');
      updateFailed.statusCode = 500;
      console.error('[DosenService.deleteESignature] Failed to update database while deleting signature metadata');
      throw updateFailed;
    }

    if (oldKey) {
      try {
        await this.storageService.deleteFile(oldKey);
      } catch (error) {
        console.warn('[DosenService.deleteESignature] Failed to delete signature from R2:', error);
      }
    }

    return { deleted: true };
  }
}
