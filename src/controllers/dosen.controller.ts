import { Context } from 'hono';
import { DosenService } from '@/services/dosen.service';
import type { JWTPayload } from '@/types';
import { createResponse, handleError } from '@/utils/helpers';
import { updateDosenProfileSchema } from '@/validation/auth.validation';

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
      const user = c.get('user') as JWTPayload;
      const body = await c.req.json();

      // Validate input
      const validated = updateDosenProfileSchema.parse(body);

      const updatedProfile = await this.dosenService.updateProfile(user.userId, validated);

      return c.json(
        createResponse(true, 'Profile updated successfully', {
          id: updatedProfile.id,
          nama: updatedProfile.nama,
          email: updatedProfile.email,
          phone: updatedProfile.phone,
          nip: updatedProfile.nip,
          jabatan: updatedProfile.jabatan,
          fakultas: updatedProfile.fakultas,
          prodi: updatedProfile.prodi,
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
      const user = c.get('user') as JWTPayload;
      const formData = await c.req.formData();
      const signatureFile = formData.get('signatureFile');

      if (!signatureFile || typeof signatureFile === 'string') {
        return c.json(createResponse(false, 'signatureFile is required'), 400);
      }

      const result = await this.dosenService.updateESignature(user.userId, signatureFile as File);

      return c.json(
        createResponse(true, 'E-signature updated', {
          url: result.url,
          key: result.key,
          uploadedAt: result.uploadedAt,
        })
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to update e-signature');
    }
  };

  deleteESignature = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      await this.dosenService.deleteESignature(user.userId);

      return c.json(createResponse(true, 'E-signature deleted', null));
    } catch (error: any) {
      return handleError(c, error, 'Failed to delete e-signature');
    }
  };
}
