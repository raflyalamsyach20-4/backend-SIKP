import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, adminOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
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
 * Extended context variables
 */
type Variables = {
  container: DIContainer;
};

/**
 * Admin Routes
 * Handles admin-specific endpoints for submission management
 */
export const createAdminRoutes = () => {
  const admin = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    // Apply auth middleware to all admin routes
    .use('*', authMiddleware)
    .use('*', adminOnly)
    .get(
      '/dashboard',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.adminController.getDashboard(c))
    )
    // Get submissions by status (more specific route first)
    .get(
      '/submissions/status/:status',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.adminController.getSubmissionsByStatus(c))
    )
    // Get all submissions
    .get(
      '/submissions',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.adminController.getAllSubmissions(c))
    )
    // Get submission by ID
    .get(
      '/submissions/:submissionId',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.adminController.getSubmissionById(c))
    )
    // Update submission status
    .put(
      '/submissions/:submissionId/status',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', updateSubmissionStatusSchema),
      withContainer((container, c) => container.adminController.updateSubmissionStatus(c))
    )
    // Approve submission
    .post(
      '/submissions/:submissionId/approve',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', approveSubmissionSchema),
      withContainer((container, c) => container.adminController.approveSubmission(c))
    )
    // Reject submission
    .post(
      '/submissions/:submissionId/reject',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectSubmissionSchema),
      withContainer((container, c) => container.adminController.rejectSubmission(c))
    )
    // Generate letter
    .post(
      '/submissions/:submissionId/generate-letter',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', generateLetterSchema),
      withContainer((container, c) => container.adminController.generateLetter(c))
    )
    // Get statistics
    .get(
      '/statistics',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.adminController.getStatistics(c))
    );

  return admin;
};
