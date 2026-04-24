import { Context } from 'hono';
import { InternshipService } from '@/services/internship.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';

export class InternshipController {
  constructor(private internshipService: InternshipService) {}

  /**
   * GET /api/internships
   */
  getInternship = async (c: Context, query: any) => {
    try {
      const user = c.get('user') as JWTPayload;
      const userId = user?.userId;
      
      if (!userId) {
        return c.json(
          createResponse(false, 'Unauthorized: User ID not found'),
          401
        );
      }

      const internshipData = await this.internshipService.getInternshipData(userId);

      return c.json(
        createResponse(true, 'Internship data retrieved successfully', internshipData),
        200
      );
    } catch (error) {
      if (error instanceof Error && (error.message.includes('No active internship') || error.message.includes('not found'))) {
        return c.json(
          createResponse(false, error.message),
          404
        );
      }
      return handleError(c, error);
    }
  };
}
