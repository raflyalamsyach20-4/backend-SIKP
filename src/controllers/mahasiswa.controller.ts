import { Context } from 'hono';
import { MahasiswaService } from '@/services/mahasiswa.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';

export class MahasiswaController {
  constructor(private mahasiswaService: MahasiswaService) {}

  /**
   * GET /api/mahasiswa/profile
   * Get mahasiswa profile data
   */
  getProfile = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const userId = user?.userId;
      
      if (!userId) {
        return c.json(
          createResponse(false, 'Unauthorized: User ID not found'),
          401
        );
      }

      const profile = await this.mahasiswaService.getMahasiswaProfile(userId);

      return c.json(
        createResponse(true, 'Profile retrieved successfully', profile),
        200
      );
    } catch (error) {
      return handleError(c, error);
    }
  };

  /**
   * GET /api/mahasiswa/internship
   * Get complete internship data (student + submission + internship)
   */
  getInternship = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const userId = user?.userId;
      
      if (!userId) {
        return c.json(
          createResponse(false, 'Unauthorized: User ID not found'),
          401
        );
      }

      const internshipData = await this.mahasiswaService.getInternshipData(userId);

      return c.json(
        createResponse(true, 'Internship data retrieved successfully', internshipData),
        200
      );
    } catch (error) {
      // Handle specific error for no internship found
      if (error instanceof Error && error.message.includes('No active internship')) {
        return c.json(
          createResponse(false, error.message),
          404
        );
      }
      
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json(
          createResponse(false, error.message),
          404
        );
      }

      return handleError(c, error);
    }
  };

  /**
   * PUT /api/mahasiswa/profile
   * Update mahasiswa profile data
   */
  updateProfile = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const userId = user?.userId;

      if (!userId) {
        return c.json(createResponse(false, 'Unauthorized: User ID not found'), 401);
      }

      const body = await c.req.json();
      const { nama, phone, prodi, fakultas, semester, angkatan } = body;

      const updated = await this.mahasiswaService.updateProfile(userId, {
        nama,
        phone,
        prodi,
        fakultas,
        semester: semester !== undefined ? Number(semester) : undefined,
        angkatan,
      });

      return c.json(createResponse(true, 'Profile updated successfully', updated), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json(createResponse(false, error.message), 404);
      }
      return handleError(c, error);
    }
  };
}
