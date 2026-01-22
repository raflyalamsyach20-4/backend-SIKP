import { Context } from 'hono';
import { ProfileServiceClient } from '@/utils/profile-service';
import { createResponse, handleError } from '@/utils/helpers';

export class AuthController {
  constructor(private profileService: ProfileServiceClient) {}

  // Get current user info from JWT + Profile Service
  me = async (c: Context) => {
    try {
      const auth = c.get('auth');
      const token = c.req.header('Authorization')?.replace('Bearer ', '');

      if (!token) {
        return c.json({ error: 'Unauthorized', message: 'No token provided' }, 401);
      }

      // Get user profiles from Profile Service
      const profileResponse = await this.profileService.getCurrentUserProfiles(token);

      const response = {
        user: {
          id: auth.userId,
          email: auth.email,
          name: auth.name,
          roles: auth.roles,
          permissions: auth.permissions,
        },
        profiles: profileResponse.success ? profileResponse.data : [],
      };

      return c.json(createResponse(true, 'User info retrieved', response));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get user info');
    }
  };

  // Get user profile (mahasiswa/dosen/admin/mentor)
  getProfile = async (c: Context) => {
    try {
      const auth = c.get('auth');
      const token = c.req.header('Authorization')?.replace('Bearer ', '');

      if (!token) {
        return c.json({ error: 'Unauthorized', message: 'No token provided' }, 401);
      }

      // Get profiles from Profile Service
      const profileResponse = await this.profileService.getCurrentUserProfiles(token);

      if (!profileResponse.success || !profileResponse.data || profileResponse.data.length === 0) {
        return c.json(
          createResponse(false, 'No profile found for this user', null),
          404
        );
      }

      return c.json(createResponse(true, 'Profile retrieved', profileResponse.data));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get profile');
    }
  };
}
