import { Context } from 'hono';
import { ResponseLetterService } from '@/services/response-letter.service';
import { createResponse, handleError } from '@/utils/helpers';
import {
  submitResponseLetterSchema,
  verifyResponseLetterSchema,
  responseLetterIdParamSchema,
  getResponseLettersQuerySchema,
} from '@/validation/response-letter.validation';
import type { JWTPayload } from '@/types';
import { UserRoles } from '@/constants/roles';

export class ResponseLetterController {
  constructor(private responseLetterService: ResponseLetterService) {}

  /**
   * Mahasiswa: Submit response letter for a submission
   * POST /api/response-letters
   */
  submitResponseLetter = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const formData = await c.req.formData();
      
      const file = formData.get('file') as File | null;
      const submissionId = formData.get('submissionId') as string;

      // Validate request data
      const validationResult = submitResponseLetterSchema.safeParse({
        submissionId,
        file,
      });

      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.errors,
          }),
          400
        );
      }

      const data = validationResult.data;
      const responseLetter = await this.responseLetterService.submitResponseLetter(
        data.submissionId,
        user.userId,
        data.file as File
      );

      return c.json(
        createResponse(true, 'Response letter submitted successfully', responseLetter),
        201
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to submit response letter');
    }
  };

  /**
   * Admin: Get all response letters with filters
   * GET /api/response-letters/admin
   */
  getAllResponseLetters = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;

      // Only admin can access
      if (user.role !== UserRoles.ADMIN) {
        return c.json(
          createResponse(false, 'You are not authorized to access this resource'),
          403
        );
      }

      const query = c.req.query();
      
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

      return c.json(createResponse(true, 'Response letters retrieved successfully', result));
    } catch (error: any) {
      return handleError(c, error, 'Failed to retrieve response letters');
    }
  };

  /**
   * Mahasiswa: Get my response letter (current user)
   * GET /api/response-letters/my
   */
  getMyResponseLetter = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;

      if (!user || !user.userId) {
        return c.json(
          createResponse(false, 'Unauthorized'),
          401
        );
      }

      const responseLetter = await this.responseLetterService.getMyResponseLetter(user.userId);

      if (!responseLetter) {
        return c.json(
          createResponse(true, 'No response letter found', null)
        );
      }

      return c.json(
        createResponse(true, 'Response letter retrieved successfully', responseLetter)
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to retrieve response letter');
    }
  };

  /**
   * Mahasiswa: Get response letter by ID (own team only)
   * Admin: Get any response letter by ID
   * GET /api/response-letters/:id
   */
  getResponseLetterById = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const id = c.req.param('id');

      // Validate parameter
      const validationResult = responseLetterIdParamSchema.safeParse({ id });
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.errors,
          }),
          400
        );
      }

      const responseLetter = await this.responseLetterService.getResponseLetterById(
        id,
        user.userId,
        user.role as string
      );

      return c.json(
        createResponse(true, 'Response letter retrieved successfully', responseLetter)
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to retrieve response letter');
    }
  };

  /**
   * Admin: Verify response letter (approve or reject)
   * PUT /api/response-letters/admin/:id/verify
   */
  verifyResponseLetter = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;

      // Only admin can verify
      if (user.role !== UserRoles.ADMIN) {
        return c.json(
          createResponse(false, 'You are not authorized to verify response letters'),
          403
        );
      }

      const id = c.req.param('id');
      const body = await c.req.json();

      // Validate parameter
      const paramValidation = responseLetterIdParamSchema.safeParse({ id });
      if (!paramValidation.success) {
        return c.json(
          createResponse(false, 'Invalid ID parameter', {
            errors: paramValidation.error.errors,
          }),
          400
        );
      }

      // Validate request body
      const bodyValidation = verifyResponseLetterSchema.safeParse(body);
      if (!bodyValidation.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: bodyValidation.error.errors,
          }),
          400
        );
      }

      const data = bodyValidation.data;
      const responseLetter = await this.responseLetterService.verifyResponseLetter(
        id,
        user.userId,
        data.letterStatus
      );

      return c.json(
        createResponse(true, 'Response letter verified successfully', responseLetter)
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to verify response letter');
    }
  };

  /**
   * Admin: Delete response letter
   * DELETE /api/response-letters/admin/:id
   */
  deleteResponseLetter = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;

      // Only admin can delete
      if (user.role !== UserRoles.ADMIN) {
        return c.json(
          createResponse(false, 'You are not authorized to delete response letters'),
          403
        );
      }

      const id = c.req.param('id');

      // Validate parameter
      const validationResult = responseLetterIdParamSchema.safeParse({ id });
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.errors,
          }),
          400
        );
      }

      await this.responseLetterService.deleteResponseLetter(id);

      return c.json(
        createResponse(true, 'Response letter deleted successfully', null)
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to delete response letter');
    }
  };
}
