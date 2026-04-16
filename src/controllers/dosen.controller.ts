import { Context } from 'hono';
import { DosenService } from '@/services/dosen.service';
import type { JWTPayload } from '@/types';
import { createResponse, handleError } from '@/utils/helpers';

export class DosenController {
  constructor(private dosenService: DosenService) {}

  dashboard = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const dashboard = await this.dosenService.getDashboard(user.userId);

      return c.json(createResponse(true, 'Dosen dashboard retrieved', dashboard));
    } catch (error: any) {
      return handleError(c, error, 'Failed to retrieve dosen dashboard');
    }
  };

  wakdekDashboard = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const dashboard = await this.dosenService.getWakdekDashboard(user.userId, user.role);

      return c.json(createResponse(true, 'Wakil dekan dashboard retrieved', dashboard));
    } catch (error: any) {
      return handleError(c, error, 'Failed to retrieve wakil dekan dashboard');
    }
  };

  me = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const profile = await this.dosenService.getMe(user.userId);

      return c.json(
        createResponse(true, 'Dosen profile retrieved', {
          id: profile.id,
          nama: profile.nama,
          email: profile.email,
          phone: profile.phone,
          nip: profile.nip,
          jabatan: profile.jabatan,
          fakultas: profile.fakultas,
          prodi: profile.prodi,
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
      return handleError(c, error, 'Failed to retrieve dosen profile');
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
