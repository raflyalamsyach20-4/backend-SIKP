import { Context } from 'hono';
import { MentorService } from '@/services/mentor.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';

export class MentorController {
  constructor(private mentorService: MentorService) {}

  private getMentorId(c: Context): string | null {
    const user = c.get('user') as JWTPayload;
    return user?.userId ?? null;
  }

  private notFound(c: Context, msg = 'Resource not found') {
    return c.json(createResponse(false, msg), 404);
  }

  private forbidden(c: Context, msg = 'Access denied') {
    return c.json(createResponse(false, msg), 403);
  }

  // ─── Profile ────────────────────────────────────────────────────────────────

  /**
   * GET /api/mentor/profile
   */
  getProfile = async (c: Context) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const profile = await this.mentorService.getProfile(mentorId);
      return c.json(createResponse(true, 'Profile retrieved successfully', profile), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      return handleError(c, error);
    }
  };

  /**
   * PUT /api/mentor/profile
   */
  updateProfile = async (c: Context) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const { nama, phone, companyName, position, companyAddress } = await c.req.json();
      const updated = await this.mentorService.updateProfile(mentorId, { nama, phone, companyName, position, companyAddress });
      return c.json(createResponse(true, 'Profile updated successfully', updated), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      return handleError(c, error);
    }
  };

  // ─── Signature ──────────────────────────────────────────────────────────────

  /**
   * GET /api/mentor/signature
   */
  getSignature = async (c: Context) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const data = await this.mentorService.getSignature(mentorId);
      return c.json(createResponse(true, 'Signature data retrieved', data), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      return handleError(c, error);
    }
  };

  /**
   * PUT /api/mentor/signature
   */
  updateSignature = async (c: Context) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const { signature } = await c.req.json();
      if (!signature) return c.json(createResponse(false, 'signature field is required (Base64 data URL)'), 400);

      const updated = await this.mentorService.updateSignature(mentorId, signature);
      return c.json(createResponse(true, 'Signature updated successfully', updated), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('valid')) {
        return c.json(createResponse(false, error.message), 400);
      }
      return handleError(c, error);
    }
  };

  /**
   * POST /api/mentor/signature/delete
   */
  deleteSignature = async (c: Context) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      await this.mentorService.deleteSignature(mentorId);
      return c.json(createResponse(true, 'Signature deleted successfully'), 200);
    } catch (error) {
      return handleError(c, error);
    }
  };

  // ─── Mentees ────────────────────────────────────────────────────────────────

  /**
   * GET /api/mentor/mentees
   */
  getMentees = async (c: Context) => {
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
   * GET /api/mentor/mentees/:studentId
   */
  getMenteeById = async (c: Context) => {
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
   * GET /api/mentor/logbook/:studentId
   */
  getStudentLogbooks = async (c: Context) => {
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
   * POST /api/mentor/logbook/:logbookId/approve
   */
  approveLogbook = async (c: Context) => {
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
   * POST /api/mentor/logbook/:logbookId/reject
   */
  rejectLogbook = async (c: Context) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const logbookId = c.req.param('logbookId');
      const { rejectionReason } = await c.req.json();

      if (!rejectionReason?.trim()) {
        return c.json(createResponse(false, 'rejectionReason is required'), 400);
      }

      const entry = await this.mentorService.rejectLogbook(mentorId, logbookId, rejectionReason);
      return c.json(createResponse(true, 'Logbook entry rejected', entry), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) return this.notFound(c, error.message);
      if (error instanceof Error && error.message.includes('Access denied')) return this.forbidden(c, error.message);
      return handleError(c, error);
    }
  };

  /**
   * POST /api/mentor/logbook/:studentId/approve-all
   */
  approveAllLogbooks = async (c: Context) => {
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
   * POST /api/mentor/assessment
   */
  createAssessment = async (c: Context) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const body = await c.req.json();
      const { studentUserId, kehadiran, kerjasama, sikapEtika, prestasiKerja, kreatifitas, feedback } = body;

      if (!studentUserId) return c.json(createResponse(false, 'studentUserId is required'), 400);
      if (kehadiran === undefined || kerjasama === undefined || sikapEtika === undefined ||
          prestasiKerja === undefined || kreatifitas === undefined) {
        return c.json(createResponse(false, 'All score fields are required: kehadiran, kerjasama, sikapEtika, prestasiKerja, kreatifitas'), 400);
      }

      const assessment = await this.mentorService.createAssessment(mentorId, {
        studentUserId,
        kehadiran: Number(kehadiran),
        kerjasama: Number(kerjasama),
        sikapEtika: Number(sikapEtika),
        prestasiKerja: Number(prestasiKerja),
        kreatifitas: Number(kreatifitas),
        feedback,
      });

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
   * GET /api/mentor/assessment/:studentId
   */
  getAssessmentByStudent = async (c: Context) => {
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
   * PUT /api/mentor/assessment/:assessmentId
   */
  updateAssessment = async (c: Context) => {
    try {
      const mentorId = this.getMentorId(c);
      if (!mentorId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const assessmentId = c.req.param('assessmentId');
      const { kehadiran, kerjasama, sikapEtika, prestasiKerja, kreatifitas, feedback } = await c.req.json();

      const updated = await this.mentorService.updateAssessment(mentorId, assessmentId, {
        kehadiran: kehadiran !== undefined ? Number(kehadiran) : undefined,
        kerjasama: kerjasama !== undefined ? Number(kerjasama) : undefined,
        sikapEtika: sikapEtika !== undefined ? Number(sikapEtika) : undefined,
        prestasiKerja: prestasiKerja !== undefined ? Number(prestasiKerja) : undefined,
        kreatifitas: kreatifitas !== undefined ? Number(kreatifitas) : undefined,
        feedback,
      });

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
