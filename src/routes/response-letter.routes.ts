import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import { submitResponseLetterSchema, verifyResponseLetterSchema } from '@/validation/response-letter.validation';

/**
 * Extended context variables
 */
type Variables = {
  container: DIContainer;
};

/**
 * Response Letter Routes
 * Base path: /api/response-letters
 */
export const createResponseLetterRoutes = () => {
  const router = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    // Apply auth middleware to all routes
    .use('*', authMiddleware)

  /**
   * Mahasiswa: Submit response letter for a submission
   * POST /api/response-letters
   * Auth: Required (Mahasiswa only)
   * Body: FormData { submissionId: string, file: File }
   */
    .post(
      '/',
      zValidator('form', submitResponseLetterSchema),
      withContainer((container, c) => container.responseLetterController.submitResponseLetter(c))
    )

  /**
   * Admin: Get all response letters with filters
   * GET /api/response-letters/admin
   * Auth: Required (Admin only)
   * Query: letterStatus?, verified?, sortBy?, sortOrder?, page?, limit?
   */
    .get(
      '/admin',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.responseLetterController.getAllResponseLetters(c))
    )

  /**
   * Mahasiswa: Get my response letter (current user)
   * GET /api/response-letters/my
   * Auth: Required
   */
    .get(
      '/my',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.responseLetterController.getMyResponseLetter(c))
    )

  /**
   * Get response letter status (for polling team reset status)
   * GET /api/response-letters/:id/status
   * Auth: Required
   */
    .get(
      '/:id/status',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.responseLetterController.getResponseLetterStatus(c))
    )

  /**
   * Mahasiswa: Get response letter by ID (own team only)
   * Admin: Get unknown response letter by ID
   * GET /api/response-letters/:id
   * Auth: Required
   */
    .get(
      '/:id',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.responseLetterController.getResponseLetterById(c))
    )

  /**
   * Admin: Verify response letter (approve or reject)
   * PUT /api/response-letters/admin/:id/verify
   * Auth: Required (Admin only)
   * Body: { letterStatus: 'approved' | 'rejected' }
   */
    .put(
      '/admin/:id/verify',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', verifyResponseLetterSchema),
      withContainer((container, c) => container.responseLetterController.verifyResponseLetter(c))
    )

  /**
   * Admin: Delete response letter
   * DELETE /api/response-letters/admin/:id
   * Auth: Required (Admin only)
   */
    .delete(
      '/admin/:id',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.responseLetterController.deleteResponseLetter(c))
    );

  return router;
};
