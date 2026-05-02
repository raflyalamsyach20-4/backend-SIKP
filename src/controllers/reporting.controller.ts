import { Context } from 'hono';
import { ReportingService } from '@/services/reporting.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';

export class ReportingController {
  private reportingService: ReportingService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.reportingService = new ReportingService(this.c.env);
  }

  /**
   * POST /api/reporting/submit-fast
   * Shortcut for submitting title and report at once
   */
  submitFast = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const body = await this.c.req.parseBody();
      
      const title = body.title as string;
      const abstract = body.abstract as string;
      const file = body.file as File;

      if (!title || !file) {
        return this.c.json(createResponse(false, 'Title and report file are required'), 400);
      }

      // We need to find the active internshipId for this student
      // We can use a simple lookup or pass it from frontend
      const internshipId = body.internshipId as string;
      if (!internshipId) {
         return this.c.json(createResponse(false, 'Internship ID is required'), 400);
      }

      const result = await this.reportingService.submitTitleAndReport(internshipId, { title, abstract, file });

      return this.c.json(createResponse(true, 'Title and report submitted successfully (Fast Track)', result), 201);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/reporting/score-fast
   * Shortcut for Dosen PA to score and finalize internship
   */
  scoreFast = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const body = await this.c.req.json();
      const { internshipId, scores } = body;

      if (!internshipId || !scores) {
        return this.c.json(createResponse(false, 'Internship ID and scores are required'), 400);
      }

      const result = await this.reportingService.scoreReport(internshipId, user.userId, scores);

      return this.c.json(createResponse(true, 'Internship finalized and scored successfully', result), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };
}
