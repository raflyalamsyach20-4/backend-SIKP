import { Hono } from 'hono';
import { authMiddleware, adminOnly } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import {
  emptyQuerySchema,
  nonEmptyStringParamsSchema,
} from '@/schemas/common.schema';
import {
  updateSubmissionStatusSchema,
  approveSubmissionSchema,
  rejectSubmissionSchema,
  generateLetterSchema,
} from '@/schemas/admin.schema';

/**
 * Admin Routes
 * Handles admin-specific endpoints for submission management
 */
export const createAdminRoutes = () => {
  const admin = new Hono<{ Bindings: CloudflareBindings }>()
    // Apply auth middleware to all admin routes
    .use('*', authMiddleware)
    .use('*', adminOnly)
    .get(
      '/dashboard',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.adminController.getDashboard, runtime.adminController, [c, c.req.valid('query')]);
      }
    )
    // Get submissions by status (more specific route first)
    .get(
      '/submissions/status/:status',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.adminController.getSubmissionsByStatus, runtime.adminController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    // Get all submissions
    .get(
      '/submissions',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.adminController.getAllSubmissions, runtime.adminController, [c, c.req.valid('query')]);
      }
    )
    // Get submission by ID
    .get(
      '/submissions/:submissionId',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.adminController.getSubmissionById, runtime.adminController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    // Update submission status
    .put(
      '/submissions/:submissionId/status',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', updateSubmissionStatusSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.adminController.updateSubmissionStatus, runtime.adminController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    // Approve submission
    .post(
      '/submissions/:submissionId/approve',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', approveSubmissionSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.adminController.approveSubmission, runtime.adminController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    // Reject submission
    .post(
      '/submissions/:submissionId/reject',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectSubmissionSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.adminController.rejectSubmission, runtime.adminController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    // Generate letter
    .post(
      '/submissions/:submissionId/generate-letter',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', generateLetterSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.adminController.generateLetter, runtime.adminController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    // Get statistics
    .get(
      '/statistics',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.adminController.getStatistics, runtime.adminController, [c, c.req.valid('query')]);
      }
    );

  return admin;
};
