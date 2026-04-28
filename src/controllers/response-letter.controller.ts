import { Context } from 'hono';
import { ResponseLetterService } from '@/services/response-letter.service';
import { createResponse, handleError } from '@/utils/helpers';
import {
  submitResponseLetterSchema,
  verifyResponseLetterSchema,
  responseLetterIdParamSchema,
} from '@/validation/response-letter.validation';
import type { JWTPayload } from '@/types';

export class ResponseLetterController {
  private responseLetterService: ResponseLetterService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.responseLetterService = new ResponseLetterService(this.c.env);
  }

  /**
   * Mahasiswa: Submit response letter for a submission
   * POST /api/response-letters
   */
  submitResponseLetter = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const formData = await this.c.req.formData();
      
      const file = formData.get('file') as File | null;
      const submissionId = formData.get('submissionId') as string;
      const letterStatus = formData.get('letterStatus') as string | null;

      // Validate request data
      const validationResult = submitResponseLetterSchema.safeParse({
        submissionId,
        letterStatus: letterStatus ?? undefined,
        file,
      });

      if (!validationResult.success) {
        return this.c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const data = validationResult.data;
      const responseLetter = await this.responseLetterService.submitResponseLetter(
        data.submissionId,
        user.mahasiswaId!,
        data.file as File,
        data.letterStatus
      );

      return this.c.json(
        createResponse(true, 'Response letter submitted successfully', responseLetter),
        201
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to submit response letter');
    }
  };

  /**
   * Admin: Get all response letters with filters
   * GET /api/response-letters/admin
   */
  getAllResponseLetters = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;

      // Only admin can access
      if (user.role !== 'admin') {
        return this.c.json(
          createResponse(false, 'You are not authorized to access this resource'),
          403
        );
      }

      const query = this.c.req.query();
      
      // Map query parameters to service filter format
      let status: 'all' | 'approved' | 'rejected' | 'verified' | 'unverified' = 'all';
      
      if (query.letterStatus === 'approved' || query.letterStatus === 'rejected') {
        status = query.letterStatus;
      } else if (query.verified === 'true') {
        status = 'verified';
      } else if (query.verified === 'false') {
        status = 'unverified';
      }

      const filters = {
        status,
        sort: (query.sort as 'date' | 'name') || 'date',
        limit: query.limit ? parseInt(query.limit) : 50,
        offset: query.offset ? parseInt(query.offset) : 0,
      };

      const result = await this.responseLetterService.getAllResponseLetters(filters);

      return this.c.json(createResponse(true, 'Response letters retrieved successfully', result));
    } catch (error) {
      return handleError(this.c, error, 'Failed to retrieve response letters');
    }
  };

  /**
   * Mahasiswa: Get my response letter (current user)
   * GET /api/response-letters/my
   */
  getMyResponseLetter = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;

      if (!user || !user.mahasiswaId) {
        return this.c.json(
          createResponse(false, 'Unauthorized or student identity not selected'),
          401
        );
      }

      const responseLetter = await this.responseLetterService.getMyResponseLetter(user.mahasiswaId);

      if (!responseLetter) {
        return this.c.json(
          createResponse(true, 'No response letter found', null)
        );
      }

      return this.c.json(
        createResponse(true, 'Response letter retrieved successfully', responseLetter)
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to retrieve response letter');
    }
  };

  /**
   * Mahasiswa: Get response letter by ID (own team only)
   * Admin: Get unknown response letter by ID
   * GET /api/response-letters/:id
   */
  getResponseLetterById = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const id = this.c.req.param('id');

      // Validate parameter
      const validationResult = responseLetterIdParamSchema.safeParse({ id });
      if (!validationResult.success) {
        return this.c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const responseLetter = await this.responseLetterService.getResponseLetterById(
        id,
        user.mahasiswaId || user.userId,
        user.role as string
      );

      return this.c.json(
        createResponse(true, 'Response letter retrieved successfully', responseLetter)
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to retrieve response letter');
    }
  };

  /**
   * Admin: Verify response letter (approve or reject)
   * PUT /api/response-letters/admin/:id/verify
   */
  verifyResponseLetter = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;

      // Only admin can verify
      if (user.role !== 'admin') {
        return this.c.json(
          createResponse(false, 'You are not authorized to verify response letters'),
          403
        );
      }

      const id = this.c.req.param('id');
      const body = await this.c.req.json();

      // Validate parameter
      const paramValidation = responseLetterIdParamSchema.safeParse({ id });
      if (!paramValidation.success) {
        return this.c.json(
          createResponse(false, 'Invalid ID parameter', {
            errors: paramValidation.error.issues,
          }),
          400
        );
      }

      // Validate request body
      const bodyValidation = verifyResponseLetterSchema.safeParse(body);
      if (!bodyValidation.success) {
        return this.c.json(
          createResponse(false, 'Validation failed', {
            errors: bodyValidation.error.issues,
          }),
          400
        );
      }

      const data = bodyValidation.data;
      const result = await this.responseLetterService.verifyResponseLetter(
        id,
        user.adminId || user.userId!,
        data.letterStatus
      );

      return this.c.json(
        createResponse(true, 'Response letter verified successfully', {
          ...result.responseLetter,
          resetTeam: result.resetTeam,
          resetReason: result.resetTeam ? 'rejected' : null,
        })
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to verify response letter');
    }
  };

  /**
   * Admin: Delete response letter
   * DELETE /api/response-letters/admin/:id
   */
  deleteResponseLetter = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;

      // Only admin can delete
      if (user.role !== 'admin') {
        return this.c.json(
          createResponse(false, 'You are not authorized to delete response letters'),
          403
        );
      }

      const id = this.c.req.param('id');

      // Validate parameter
      const validationResult = responseLetterIdParamSchema.safeParse({ id });
      if (!validationResult.success) {
        return this.c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      await this.responseLetterService.deleteResponseLetter(id);

      return this.c.json(
        createResponse(true, 'Response letter deleted successfully', null)
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to delete response letter');
    }
  };

  /**
   * Get response letter status (for polling team reset status)
   * GET /api/response-letters/:id/status
   * Auth: Required
   */
  getResponseLetterStatus = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const id = this.c.req.param('id');

      // Validate parameter
      const validationResult = responseLetterIdParamSchema.safeParse({ id });
      if (!validationResult.success) {
        return this.c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const status = await this.responseLetterService.getResponseLetterStatus(
        id,
        user.mahasiswaId || user.userId,
        user.role as string
      );

      return this.c.json(
        createResponse(true, 'Response letter status retrieved successfully', status)
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to retrieve response letter status');
    }
  };
}
