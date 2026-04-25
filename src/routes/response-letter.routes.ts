import { Hono } from 'hono';
import { authMiddleware } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import { submitResponseLetterSchema, verifyResponseLetterSchema } from '@/validation/response-letter.validation';
import { ResponseLetterController } from '@/controllers';

/**
 * Response Letter Routes
 * Base path: /api/response-letters
 */
export const createResponseLetterRoutes = () => {
  const router = new Hono<{ Bindings: CloudflareBindings }>()
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
      async (c) => {
        return new ResponseLetterController(c).submitResponseLetter();
      }
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
      async (c) => {
        return new ResponseLetterController(c).getAllResponseLetters();
      }
    )

  /**
   * Mahasiswa: Get my response letter (current user)
   * GET /api/response-letters/my
   * Auth: Required
   */
    .get(
      '/my',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new ResponseLetterController(c).getMyResponseLetter();
      }
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
      async (c) => {
        return new ResponseLetterController(c).getResponseLetterStatus();
      }
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
      async (c) => {
        return new ResponseLetterController(c).getResponseLetterById();
      }
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
      async (c) => {
        return new ResponseLetterController(c).verifyResponseLetter();
      }
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
      async (c) => {
        return new ResponseLetterController(c).deleteResponseLetter();
      }
    );

  return router;
};
