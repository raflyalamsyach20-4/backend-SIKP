import { Hono } from 'hono';
import { authMiddleware } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import { submitResponseLetterSchema, verifyResponseLetterSchema } from '@/validation/response-letter.validation';

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
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.responseLetterController.submitResponseLetter, runtime.responseLetterController, [c, c.req.valid('form')]);
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
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.responseLetterController.getAllResponseLetters, runtime.responseLetterController, [c, c.req.valid('query')]);
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
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.responseLetterController.getMyResponseLetter, runtime.responseLetterController, [c, c.req.valid('query')]);
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
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.responseLetterController.getResponseLetterStatus, runtime.responseLetterController, [c, c.req.valid('param'), c.req.valid('query')]);
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
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.responseLetterController.getResponseLetterById, runtime.responseLetterController, [c, c.req.valid('param'), c.req.valid('query')]);
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
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.responseLetterController.verifyResponseLetter, runtime.responseLetterController, [c, c.req.valid('param'), c.req.valid('json')]);
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
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.responseLetterController.deleteResponseLetter, runtime.responseLetterController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    );

  return router;
};
