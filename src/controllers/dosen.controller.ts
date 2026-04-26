import { Context } from 'hono';
import { DosenService } from '@/services/dosen.service';
import { createResponse, handleError } from '@/utils/helpers';

export class DosenController {
  private dosenService: DosenService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.dosenService = new DosenService(this.c.env);
  }

  dashboard = async () => {
    try {
      const user = this.c.get('user');
      const dashboard = await this.dosenService.getDashboard(user.dosenId!);

      return this.c.json(createResponse(true, 'Dosen dashboard retrieved', dashboard));
    } catch (error) {
      return handleError(this.c, error, 'Failed to retrieve dosen dashboard');
    }
  };

  wakdekDashboard = async () => {
    try {
      const user = this.c.get('user');
      const sessionId = this.c.get('sessionId');
      const dashboard = await this.dosenService.getWakdekDashboard(user.dosenId!, user.role, sessionId);

      return this.c.json(createResponse(true, 'Wakil dekan dashboard retrieved', dashboard));
    } catch (error) {
      return handleError(this.c, error, 'Failed to retrieve wakil dekan dashboard');
    }
  };

  me = async () => {
    try {
      const user = this.c.get('user');
      const sessionId = this.c.get('sessionId');
      
      // Use the new getDosenById which hits SSO strictly
      const profile = await this.dosenService.getDosenById(user.dosenId!, sessionId);
      
      if (!profile) {
        return this.c.json(createResponse(false, 'Dosen profile not found in SSO'), 404);
      }

      return this.c.json(
        createResponse(true, 'Dosen profile retrieved', {
          id: profile.profile.id,
          nama: profile.profile.fullName,
          nidn: profile.nidn,
          jabatanFungsional: profile.jabatanFungsional,
          jabatanStruktural: profile.jabatanStruktural,
          fakultas: profile.fakultas?.nama || null,
          prodi: profile.prodi?.nama || null,
        })
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to retrieve dosen profile');
    }
  };

  updateProfile = async () => {
    try {
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
    } catch (error) {
      return handleError(this.c, error, 'Failed to update profile');
    }
  };

  updateESignature = async () => {
    try {
      return this.c.json(
        createResponse(
          false,
          'Legacy endpoint deprecated. Use /api/profile/signature instead.'
        ),
        410
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to update e-signature');
    }
  };

  deleteESignature = async () => {
    try {
      return this.c.json(
        createResponse(
          false,
          'Legacy endpoint deprecated. Use /api/profile/signature/:id instead.'
        ),
        410
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to delete e-signature');
    }
  };
}
