import { Context } from 'hono';
import { InternshipService } from '@/services/internship.service';
import { InternshipDocumentService } from '@/services/internship-document.service';
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

  /**
   * GET /api/internships/check-status
   */
  checkInternshipStatus = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const userId = user.userId!;
      const sessionId = user.sessionId!;

      const data = await this.internshipService.getInternshipData(userId, sessionId);
      if (!data || !data.internship) {
        return this.c.json(createResponse(false, 'No active internship found'), 404);
      }

      const documentService = new InternshipDocumentService(this.c.env);
      const isFull = await documentService.isLogbookFull(data.internship.id);
      const isAssessmentFilled = await documentService.isAssessmentFilled(data.internship.id);

      return this.c.json(createResponse(true, 'Status checked', { 
        isLogbookFull: isFull,
        isAssessmentFilled 
      }), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/internships/generate/:type
   */
  generateDocument = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const userId = user.userId!;
      const sessionId = user.sessionId!;
      const type = this.c.req.param('type') as 'logbook' | 'assessment';
      const format = (this.c.req.query('format') || 'pdf') as 'pdf' | 'docx';

      const documentService = new InternshipDocumentService(this.c.env);
      const data = await this.internshipService.getInternshipData(userId, sessionId);
      if (!data || !data.internship) {
        return this.c.json(createResponse(false, 'No active internship found'), 404);
      }

      let withSignature = false;
      if (type === 'logbook') {
        const isFull = await documentService.isLogbookFull(data.internship.id);
        // Requirement: Logbook Docx is always without signature. PDF only if full.
        withSignature = isFull && format === 'pdf';
      } else {
        const isFilled = await documentService.isAssessmentFilled(data.internship.id);
        // Requirement: Assessment Docx is always without signature. PDF only if filled.
        withSignature = isFilled && format === 'pdf';
      }

      const buffer = type === 'logbook' 
        ? await documentService.generateLogbook(userId, sessionId, { format, withSignature })
        : await documentService.generateAssessment(userId, sessionId, { format, withSignature });

      const contentType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const ext = format === 'pdf' ? 'pdf' : 'docx';

      this.c.header('Content-Type', contentType);
      this.c.header('Content-Disposition', `attachment; filename="${type}-${userId}.${ext}"`);
      
      return this.c.body(buffer as any);
    } catch (error) {
      return handleError(this.c, error);
    }
  };
}
