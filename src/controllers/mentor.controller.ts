import { Context } from 'hono';
import { MentorService } from '@/services/mentor.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';

export class MentorController {
  constructor(private mentorService: MentorService) {}

  private getMentorId(c: Context): string | null {
    const user = c.get('user') as JWTPayload;
    return user?.profileId ?? null;
  }

  private notFound(c: Context, msg = 'Resource not found') {
    return c.json(createResponse(false, msg), 404);
  }

  private forbidden(c: Context, msg = 'Access denied') {
    return c.json(createResponse(false, msg), 403);
  }


  // ─── Mentees ────────────────────────────────────────────────────────────────

  /**
   * GET /api/mentorship/mentees
   */
  getMentees = async (c: Context, query: any) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const mentees = await this.mentorService.getMentees(mentorId);
      return c.json(createResponse(true, 'Mentees retrieved successfully', mentees), 200);
    } catch (error) {
      return handleError(c, error);
    }
  };

  /**
   * GET /api/mentorship/mentees/:studentId
   */
  getMenteeById = async (c: Context, query: any) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const studentId = c.req.param('studentId');
      const mentee = await this.mentorService.getMenteeById(mentorId, studentId);
      return c.json(createResponse(true, 'Mentee details retrieved successfully', mentee), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      return handleError(c, error);
    }
  };

  // ─── Logbooks ───────────────────────────────────────────────────────────────

  /**
   * GET /api/mentorship/mentees/:studentId/logbooks
   */
  getStudentLogbooks = async (c: Context, query: any) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const studentId = c.req.param('studentId');
      const data = await this.mentorService.getStudentLogbooks(mentorId, studentId);
      return c.json(createResponse(true, 'Student logbooks retrieved successfully', data), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      return handleError(c, error);
    }
  };

  /**
   * POST /api/mentorship/logbooks/:logbookId/approve
   */
  approveLogbook = async (c: Context, validated: any) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const logbookId = c.req.param('logbookId');
      const entry = await this.mentorService.approveLogbook(mentorId, logbookId);
      return c.json(createResponse(true, 'Logbook entry approved', entry), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      if (error instanceof Error && error.message.includes('Access denied')) return this.forbidden(c, error.message);
      return handleError(c, error);
    }
  };

  /**
   * POST /api/mentorship/logbooks/:logbookId/reject
   */
  rejectLogbook = async (c: Context, validated: any) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const logbookId = c.req.param('logbookId');
      const entry = await this.mentorService.rejectLogbook(mentorId, logbookId, validated.rejectionReason);
      return c.json(createResponse(true, 'Logbook entry rejected', entry), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      if (error instanceof Error && error.message.includes('Access denied')) return this.forbidden(c, error.message);
      return handleError(c, error);
    }
  };

  /**
   * POST /api/mentorship/mentees/:studentId/approve-all
   */
  approveAllLogbooks = async (c: Context, validated: any) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const studentId = c.req.param('studentId');
      const result = await this.mentorService.approveAllLogbooks(mentorId, studentId);
      return c.json(createResponse(true, result.message, result), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      return handleError(c, error);
    }
  };

  // ─── Assessments ────────────────────────────────────────────────────────────

  /**
   * POST /api/mentorship/assessments
   */
  createAssessment = async (c: Context, validated: any) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const assessment = await this.mentorService.createAssessment(mentorId, validated);

      return c.json(createResponse(true, 'Assessment created successfully', assessment), 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      if (error instanceof Error && error.message.includes('already exists')) {
        return c.json(createResponse(false, error.message), 409);
      }
      if (error instanceof Error && error.message.includes('between 0 and 100')) {
        return c.json(createResponse(false, error.message), 400);
      }
      return handleError(c, error);
    }
  };

  /**
   * GET /api/mentorship/assessments/:studentId
   */
  getAssessmentByStudent = async (c: Context, query: any) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const studentId = c.req.param('studentId');
      const assessment = await this.mentorService.getAssessmentByStudent(mentorId, studentId);

      if (!assessment) {
        return c.json(createResponse(true, 'No assessment found for this student', null), 200);
      }

      return c.json(createResponse(true, 'Assessment retrieved successfully', assessment), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      return handleError(c, error);
    }
  };

  /**
   * PUT /api/mentorship/assessments/:assessmentId
   */
  updateAssessment = async (c: Context, validated: any) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const assessmentId = c.req.param('assessmentId');

      const updated = await this.mentorService.updateAssessment(mentorId, assessmentId, validated);

      return c.json(createResponse(true, 'Assessment updated successfully', updated), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      if (error instanceof Error && error.message.includes('Access denied')) return this.forbidden(c, error.message);
      if (error instanceof Error && error.message.includes('between 0 and 100')) {
        return c.json(createResponse(false, error.message), 400);
      }
      return handleError(c, error);
    }
  };
}
