import { UserRepository } from '@/repositories/user.repository';
import { StorageService } from '@/services/storage.service';

const MAX_SIGNATURE_SIZE_MB = 2;
const ALLOWED_SIGNATURE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

export class DosenService {
  constructor(
    private userRepository: UserRepository,
    private storageService: StorageService
  ) {}

  async getMe(userId: string) {
    const profile = await this.userRepository.getDosenMe(userId);
    if (!profile) {
      const notFound: any = new Error('Dosen profile not found');
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
        const emailExists: any = new Error('Email already in use');
        emailExists.statusCode = 400;
        throw emailExists;
      }
    }

    // Prepare update data for users table
    const usersUpdateData: Record<string, any> = {};
    if (data.nama !== undefined) usersUpdateData.nama = data.nama;
    if (data.email !== undefined) usersUpdateData.email = data.email;
    if (data.phone !== undefined) usersUpdateData.phone = data.phone;

    // Prepare update data for dosen table
    const dosenUpdateData: Record<string, any> = {};
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
      const invalidType: any = new Error('Invalid file type. Only PNG, JPG, and JPEG are allowed');
      invalidType.statusCode = 400;
      throw invalidType;
    }

    if (!this.storageService.validateFileSize(signatureFile.size, MAX_SIGNATURE_SIZE_MB)) {
      const invalidSize: any = new Error('File size exceeds 2MB limit');
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

        const updateFailed: any = new Error('Failed to update e-signature metadata');
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
      const updateFailed: any = new Error('Failed to clear e-signature metadata');
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
