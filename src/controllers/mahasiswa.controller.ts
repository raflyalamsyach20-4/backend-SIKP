import { Context } from 'hono';
import { MahasiswaService } from '@/services/mahasiswa.service';
import type { JWTPayload } from '@/types';
import { createResponse, handleError } from '@/utils/helpers';
import { updateMahasiswaProfileSchema } from '@/validation/auth.validation';

export class MahasiswaController {
  constructor(private mahasiswaService: MahasiswaService) {}

  dashboard = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const dashboardData = await this.mahasiswaService.getDashboard(user.userId);

      return c.json(createResponse(true, 'Mahasiswa dashboard retrieved', dashboardData));
    } catch (error: any) {
      return handleError(c, error, 'Failed to retrieve mahasiswa dashboard');
    }
  };

  me = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const profile = await this.mahasiswaService.getMe(user.userId);

      return c.json(
        createResponse(true, 'Mahasiswa profile retrieved', {
          id: profile.id,
          nama: profile.nama,
          email: profile.email,
          phone: profile.phone,
          nim: profile.nim,
          fakultas: profile.fakultas,
          prodi: profile.prodi,
          semester: profile.semester,
          jumlahSksSelesai: profile.jumlahSksSelesai,
          angkatan: profile.angkatan,
          esignature: profile.esignatureUrl
            ? {
                url: profile.esignatureUrl,
                key: profile.esignatureKey,
                uploadedAt: profile.esignatureUploadedAt,
              }
            : null,
        })
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to retrieve mahasiswa profile');
    }
  };

  updateProfile = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const body = await c.req.json();

      const validated = updateMahasiswaProfileSchema.parse(body);

      const updatedProfile = await this.mahasiswaService.updateProfile(user.userId, validated);

      return c.json(
        createResponse(true, 'Profile updated successfully', {
          id: updatedProfile.id,
          nama: updatedProfile.nama,
          email: updatedProfile.email,
          phone: updatedProfile.phone,
          nim: updatedProfile.nim,
          fakultas: updatedProfile.fakultas,
          prodi: updatedProfile.prodi,
          semester: updatedProfile.semester,
          jumlahSksSelesai: updatedProfile.jumlahSksSelesai,
          angkatan: updatedProfile.angkatan,
          esignature: updatedProfile.esignatureUrl
            ? {
                url: updatedProfile.esignatureUrl,
                key: updatedProfile.esignatureKey,
                uploadedAt: updatedProfile.esignatureUploadedAt,
              }
            : null,
        })
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to update profile');
    }
  };

  updateESignature = async (c: Context) => {
    try {
      return c.json(
        createResponse(
          false,
          'Legacy endpoint deprecated. Use /api/profile/signature instead.'
        ),
        410
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to update e-signature');
    }
  };

  deleteESignature = async (c: Context) => {
    try {
      return c.json(
        createResponse(
          false,
          'Legacy endpoint deprecated. Use /api/profile/signature/:id instead.'
        ),
        410
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to delete e-signature');
    }
  };
}
