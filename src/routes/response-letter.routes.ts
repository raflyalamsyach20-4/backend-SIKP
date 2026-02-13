import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';

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
  const router = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  // Apply auth middleware to all routes
  router.use('*', authMiddleware);

  /**
   * Mahasiswa: Submit response letter for a submission
   * POST /api/response-letters
   * Auth: Required (Mahasiswa only)
   * Body: FormData { submissionId: string, file: File }
   */
  router.post('/', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.responseLetterController.submitResponseLetter(c);
  });

  /**
   * Admin: Get all response letters with filters
   * GET /api/response-letters/admin
   * Auth: Required (Admin only)
   * Query: letterStatus?, verified?, sortBy?, sortOrder?, page?, limit?
   */
  router.get('/admin', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.responseLetterController.getAllResponseLetters(c);
  });

  /**
   * Mahasiswa: Get response letter by ID (own team only)
   * Admin: Get any response letter by ID
   * GET /api/response-letters/:id
   * Auth: Required
   */
  router.get('/:id', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.responseLetterController.getResponseLetterById(c);
  });

  /**
   * Admin: Verify response letter (approve or reject)
   * PUT /api/response-letters/admin/:id/verify
   * Auth: Required (Admin only)
   * Body: { letterStatus: 'approved' | 'rejected' }
   */
  router.put('/admin/:id/verify', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.responseLetterController.verifyResponseLetter(c);
  });

  /**
   * Admin: Delete response letter
   * DELETE /api/response-letters/admin/:id
   * Auth: Required (Admin only)
   */
  router.delete('/admin/:id', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.responseLetterController.deleteResponseLetter(c);
  });

  return router;
};
