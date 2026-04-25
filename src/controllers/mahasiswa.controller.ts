import { Context } from 'hono';
import { MahasiswaService } from '@/services/mahasiswa.service';
import type { JWTPayload } from '@/types';
import { createResponse, handleError } from '@/utils/helpers';

export class MahasiswaController {
  private mahasiswaService: MahasiswaService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.mahasiswaService = new MahasiswaService(this.c.env);
  }

  dashboard = async () => {
    try {
      const user = this.c.get('user');
      const sessionId = this.c.get('sessionId');

      if (!user.mahasiswaId) {
        throw new Error('mahasiswaId not found in session');
      }

      const dashboardData = await this.mahasiswaService.getDashboard(user.mahasiswaId, sessionId);

      return this.c.json(createResponse(true, 'Mahasiswa dashboard retrieved', dashboardData));
    } catch (error) {
      return handleError(this.c, error, 'Failed to retrieve mahasiswa dashboard');
    }
  };

  me = async () => {
    try {
      const user = this.c.get('user');
      
      // Since the frontend expects a specific structure, and SIKP doesn't store mahasiswa in local DB anymore,
      // we might want to return details from the JWT payload or fetch from SSO.
      // However, the user said to disable local management. 
      // For 'me', we can just return what's in the JWT for now, or fetch from SSO.
      
      return this.c.json(
        createResponse(true, 'Mahasiswa profile retrieved', user)
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to retrieve mahasiswa profile');
    }
  };

  updateProfile = async () => {
    return this.c.json(
      createResponse(
        false,
        'Local profile update is not available in SIKP. Please manage your profile in SSO.',
        {
          manageUrl: this.c.env.SSO_PROFILE_URL || null,
        }
      ),
      410
    );
  };

  updateESignature = async () => {
    return this.c.json(
      createResponse(
        false,
        'Legacy endpoint deprecated. Use /api/profile/signature instead.'
      ),
      410
    );
  };

  deleteESignature = async () => {
    return this.c.json(
      createResponse(
        false,
        'Legacy endpoint deprecated. Use /api/profile/signature/:id instead.'
      ),
      410
    );
  };
}
