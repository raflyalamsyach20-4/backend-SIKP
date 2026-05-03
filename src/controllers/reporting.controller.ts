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
      const body = await this.c.req.parseBody();
      
      const title = body.title as string;
      const abstract = body.abstract as string;
      const file = body.file as File;
      const internshipId = body.internshipId as string;

      if (!title || !file || !internshipId) {
        return this.c.json(createResponse(false, 'Title, report file, and Internship ID are required'), 400);
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

  // --- Standard Flow ---

  /**
   * POST /api/reporting/title
   */
  submitTitle = async () => {
    try {
      const body = await this.c.req.json();
      const { internshipId, title, description } = body;

      if (!internshipId || !title) {
        return this.c.json(createResponse(false, 'Internship ID and title are required'), 400);
      }

      const result = await this.reportingService.submitTitle(internshipId, { title, description });
      return this.c.json(createResponse(true, 'Title submitted successfully', result), 201);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/reporting/title/:internshipId
   */
  getTitle = async () => {
    try {
      const internshipId = this.c.req.param('internshipId');
      const data = await this.reportingService.getTitleSubmission(internshipId);
      return this.c.json(createResponse(true, 'Title submission retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/reporting/title/:id/approve
   */
  approveTitle = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const id = this.c.req.param('id');
      const result = await this.reportingService.approveTitle(id, user.userId);
      return this.c.json(createResponse(true, 'Title approved successfully', result), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/reporting/title/:id/reject
   */
  rejectTitle = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const id = this.c.req.param('id');
      const { reason } = await this.c.req.json();

      if (!reason) {
        return this.c.json(createResponse(false, 'Rejection reason is required'), 400);
      }

      const result = await this.reportingService.rejectTitle(id, user.userId, reason);
      return this.c.json(createResponse(true, 'Title rejected successfully', result), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/reporting/report
   */
  submitReport = async () => {
    try {
      const body = await this.c.req.parseBody();
      const internshipId = body.internshipId as string;
      const file = body.file as File;
      const title = body.title as string;
      const abstract = body.abstract as string;

      if (!internshipId || !file) {
        return this.c.json(createResponse(false, 'Internship ID and report file are required'), 400);
      }

      const result = await this.reportingService.submitReport(internshipId, { file, title, abstract });
      return this.c.json(createResponse(true, 'Report submitted successfully', result), 201);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/reporting/report/:internshipId
   */
  getReport = async () => {
    try {
      const internshipId = this.c.req.param('internshipId');
      const data = await this.reportingService.getReport(internshipId);
      return this.c.json(createResponse(true, 'Report retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };
}
