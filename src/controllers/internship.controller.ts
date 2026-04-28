import { Context } from 'hono';
import { InternshipService } from '@/services/internship.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';

export class InternshipController {
  private internshipService: InternshipService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.internshipService = new InternshipService(this.c.env);
  }

  /**
   * GET /api/internships
   */
  getInternship = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const userId = user?.userId;
      const sessionId = user?.sessionId;
      
      if (!userId || !sessionId) {
        return this.c.json(
          createResponse(false, 'Unauthorized: User ID or Session ID not found'),
          401
        );
      }

      const internshipData = await this.internshipService.getInternshipData(userId, sessionId);

      return this.c.json(
        createResponse(true, 'Internship data retrieved successfully', internshipData),
        200
      );
    } catch (error) {
      if (error instanceof Error && (error.message.includes('No active internship') || error.message.includes('not found'))) {
        return this.c.json(
          createResponse(false, error.message),
          404
        );
      }
      return handleError(this.c, error);
    }
  };
}
