import { Context } from 'hono';
import { ArchiveService } from '@/services/archive.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';

export class ArchiveController {
  private archiveService: ArchiveService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.archiveService = new ArchiveService(this.c.env);
  }

  /**
   * GET /api/archive/student
   * Retrieves both submissions and internships archive for the logged-in student
   */
  getStudentArchive = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const userId = user?.userId;
      
      if (!userId) {
        return this.c.json(createResponse(false, 'Unauthorized'), 401);
      }

      const internships = await this.archiveService.getStudentArchive(userId);

      return this.c.json(createResponse(true, 'Student archive retrieved successfully', internships), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/archive/admin/internships
   */
  getAllInternshipArchive = async () => {
    try {
      const data = await this.archiveService.getAllInternshipArchive();
      return this.c.json(createResponse(true, 'All archived internships retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/archive/admin/submissions
   */
  getAllSubmissionArchive = async () => {
    try {
      const data = await this.archiveService.getAllSubmissionArchive();
      return this.c.json(createResponse(true, 'All archived submissions retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/archive/internship/:id
   */
  archiveInternship = async () => {
    try {
      const id = this.c.req.param('id');
      const data = await this.archiveService.archiveInternship(id);
      return this.c.json(createResponse(true, 'Internship archived successfully', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };
}
