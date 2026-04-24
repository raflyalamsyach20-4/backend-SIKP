import { Context } from 'hono';
import { MahasiswaService } from '@/services/mahasiswa.service';
import type { JWTPayload } from '@/types';
import { createResponse, handleError } from '@/utils/helpers';

export class MahasiswaController {
  constructor(private mahasiswaService: MahasiswaService) {}

  dashboard = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const dashboardData = await this.mahasiswaService.getDashboard(user.userId);

      return c.json(createResponse(true, 'Mahasiswa dashboard retrieved', dashboardData));
    } catch (error) {
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
    } catch (error) {
      return handleError(c, error, 'Failed to retrieve mahasiswa profile');
    }
  };

  updateProfile = async (c: Context) => {
    try {
      return c.json(
        createResponse(
          false,
          'Local profile update is not available in SIKP. Please manage your profile in SSO.',
          {
            manageUrl: c.env.SSO_PROFILE_URL || null,
          }
        ),
        410
      );
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      return handleError(c, error, 'Failed to delete e-signature');
    }
  };
}
