import { Context } from 'hono';
import { MentorService } from '@/services/mentor.service';
import { createResponse, handleError } from '@/utils/helpers';

type ErrorLike = {
  code?: string;
  message?: string;
  statusCode?: number;
};

type ErrorResponseStatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 500;

const toErrorLike = (value: unknown): ErrorLike => {
  if (typeof value === 'object' && value !== null) {
    return value as ErrorLike;
  }
  return {};
};

const toSafeErrorStatus = (statusCode?: number): ErrorResponseStatusCode => {
  if (
    statusCode === 400 ||
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 404 ||
    statusCode === 409 ||
    statusCode === 422
  ) {
    return statusCode;
  }
  return 500;
};
import type { JWTPayload } from '@/types';

export class MentorController {
  private mentorService: MentorService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.mentorService = new MentorService(this.c.env);
  }

  private getMentorId(): string | null {
    const user = this.c.get('user') as JWTPayload;
    return user?.profileId ?? null;
  }

  private notFound(msg = 'Resource not found') {
    return this.c.json(createResponse(false, msg), 404);
  }

  private forbidden(msg = 'Access denied') {
    return this.c.json(createResponse(false, msg), 403);
  }

  // ─── Profile & Signature ───────────────────────────────────────────────────

  /**
   * GET /api/mentorship/profile
   */
  getProfile = async () => {
    try {
      const mentorId = this.getMentorId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const profile = await this.mentorService.getProfile(mentorId);
      return this.c.json(createResponse(true, 'Mentor profile retrieved successfully', profile), 200);
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to get profile',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error, 'Failed to get profile');
    }
  };

  /**
   * POST /api/mentorship/profile/signature
   */
  updateSignature = async () => {
    try {
      const mentorId = this.getMentorId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const formData = await this.c.req.formData();
      const file = formData.get('file') as File;

      if (!file || typeof file === 'string') {
        return this.c.json(createResponse(false, 'No file uploaded or invalid file'), 400);
      }

      const updated = await this.mentorService.updateSignature(mentorId, file);
      return this.c.json(createResponse(true, 'Signature uploaded successfully', updated), 200);
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to update signature',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error, 'Failed to update signature');
    }
  };


  // ─── Mentees ────────────────────────────────────────────────────────────────

  /**
   * GET /api/mentorship/mentees
   */
  getMentees = async () => {
    try {
      const mentorId = this.getMentorId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const mentees = await this.mentorService.getMentees(mentorId);
      return this.c.json(createResponse(true, 'Mentees retrieved successfully', mentees), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/mentorship/mentees/:studentId
   */
  getMenteeById = async () => {
    try {
      const mentorId = this.getMentorId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const studentId = this.c.req.param('studentId');
      const mentee = await this.mentorService.getMenteeById(mentorId, studentId);
      return this.c.json(createResponse(true, 'Mentee details retrieved successfully', mentee), 200);
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to get profile',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error, 'Failed to get profile');
    }
  };

  // ─── Logbooks ───────────────────────────────────────────────────────────────

  /**
   * GET /api/mentorship/mentees/:studentId/logbooks
   */
  getStudentLogbooks = async () => {
    try {
      const mentorId = this.getMentorId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const studentId = this.c.req.param('studentId');
      const data = await this.mentorService.getStudentLogbooks(mentorId, studentId);
      return this.c.json(createResponse(true, 'Student logbooks retrieved successfully', data), 200);
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to get profile',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error, 'Failed to get profile');
    }
  };

  /**
   * POST /api/mentorship/logbooks/:logbookId/approve
   */
  approveLogbook = async () => {
    try {
      const mentorId = this.getMentorId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const logbookId = this.c.req.param('logbookId');
      const entry = await this.mentorService.approveLogbook(mentorId, logbookId);
      return this.c.json(createResponse(true, 'Logbook entry approved', entry), 200);
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to approve logbook',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error, 'Failed to approve logbook');
    }
  };

  /**
   * POST /api/mentorship/logbooks/:logbookId/reject
   */
  rejectLogbook = async (validated: any) => {
    try {
      const mentorId = this.getMentorId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const logbookId = this.c.req.param('logbookId');
      const entry = await this.mentorService.rejectLogbook(mentorId, logbookId, validated.rejectionReason);
      return this.c.json(createResponse(true, 'Logbook entry rejected', entry), 200);
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to reject logbook',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error, 'Failed to reject logbook');
    }
  };

  /**
   * POST /api/mentorship/mentees/:studentId/approve-all
   */
  approveAllLogbooks = async () => {
    try {
      const mentorId = this.getMentorId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const studentId = this.c.req.param('studentId');
      const result = await this.mentorService.approveAllLogbooks(mentorId, studentId);
      return this.c.json(createResponse(true, result.message, result), 200);
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to approve logbooks',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error, 'Failed to approve logbooks');
    }
  };

  // ─── Assessments ────────────────────────────────────────────────────────────

  /**
   * POST /api/mentorship/assessments
   */
  createAssessment = async (validated: any) => {
    try {
      const mentorId = this.getMentorId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const assessment = await this.mentorService.createAssessment(mentorId, validated);

      return this.c.json(createResponse(true, 'Assessment created successfully', assessment), 201);
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to create assessment',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error, 'Failed to create assessment');
    }
  };

  /**
   * GET /api/mentorship/assessments/:studentId
   */
  getAssessmentByStudent = async () => {
    try {
      const mentorId = this.getMentorId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const studentId = this.c.req.param('studentId');
      const assessment = await this.mentorService.getAssessmentByStudent(mentorId, studentId);

      if (!assessment) {
        return this.c.json(createResponse(true, 'No assessment found for this student', null), 200);
      }

      return this.c.json(createResponse(true, 'Assessment retrieved successfully', assessment), 200);
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to get assessment',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error, 'Failed to get assessment');
    }
  };

  /**
   * PUT /api/mentorship/assessments/:assessmentId
   */
  updateAssessment = async (validated: any) => {
    try {
      const mentorId = this.getMentorId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const assessmentId = this.c.req.param('assessmentId');

      const updated = await this.mentorService.updateAssessment(mentorId, assessmentId, validated);

      return this.c.json(createResponse(true, 'Assessment updated successfully', updated), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(error.message);
      if (error instanceof Error && error.message.includes('Access denied')) return this.forbidden(error.message);
      if (error instanceof Error && error.message.includes('between 0 and 100')) {
        return this.c.json(createResponse(false, error.message), 400);
      }
      return handleError(this.c, error);
    }
  };
}
