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

      return this.c.json(createResponse(true, 'Title and report submitted successfully (Fast Track)', {
        ...result,
        title: title // Mapping input title back for consistency
      }), 201);
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

      const dosenIdForSso = user.dosenId || user.userId;
      const result = await this.reportingService.scoreReport(internshipId, dosenIdForSso, scores);

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
      const mapped = Array.isArray(result) ? result[0] : result;
      
      return this.c.json(createResponse(true, 'Title submitted successfully', {
        ...mapped,
        title: mapped.proposedTitle
      }), 201);
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
      
      if (!data) {
        return this.c.json(createResponse(true, 'No title submission found', null), 200);
      }

      return this.c.json(createResponse(true, 'Title submission retrieved', {
        ...data,
        title: data.proposedTitle
      }), 200);
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

      // user.dosenId = dsn?.id (SSO identity ID accepted by /api/dosen/:id)
      // user.userId  = authUserId (CUID — rejected by SSO with 400)
      const dosenIdForSso = user.dosenId || user.userId;

      const result = await this.reportingService.approveTitle(id, dosenIdForSso);
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

  /**
   * GET /api/reporting/lecturer/reports
   */
  getMenteesReports = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const data = await this.reportingService.getMenteesReports(user.dosenId);
      return this.c.json(createResponse(true, 'Mentees reports retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/reporting/report/:id/approve
   */
  approveReport = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const id = this.c.req.param('id');
      const result = await this.reportingService.approveReport(id, user.dosenId);
      return this.c.json(createResponse(true, 'Report approved successfully', result), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/reporting/report/:id/reject
   */
  rejectReport = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const id = this.c.req.param('id');
      const { reason } = await this.c.req.json();
      
      const result = await this.reportingService.rejectReport(id, user.dosenId, reason);
      return this.c.json(createResponse(true, 'Report rejected successfully', result), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/reporting/admin/backfill-dosen
   * One-time repair: isi dosenPembimbingId dari titleSubmissions.approvedBy
   * untuk internship yang sudah terlanjur null.
   */
  backfillDosenPembimbing = async () => {
    try {
      const result = await this.reportingService.backfillDosenPembimbingId();
      return this.c.json(createResponse(
        true,
        `Backfill selesai: ${result.updated} internship diperbarui, ${result.skipped} dilewati`,
        result
      ), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };
}
