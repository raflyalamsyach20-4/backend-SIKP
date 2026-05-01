import { Hono } from 'hono';
import { authMiddleware, adminOnly } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import {
  emptyQuerySchema,
  nonEmptyStringParamsSchema,
} from '@/schemas/common.schema';
import {
  updateSubmissionStatusSchema,
  approveSubmissionSchema,
  rejectSubmissionSchema,
  generateLetterSchema,
  updatePenilaianKriteriaSchema,
} from '@/schemas/admin.schema';
import { AdminController } from '@/controllers';
import { PenilaianController } from '@/controllers/penilaian.controller';

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
        return new AdminController(c).getDashboard();
      }
    )
    // Get submissions by status (more specific route first)
    .get(
      '/submissions/status/:status',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new AdminController(c).getSubmissionsByStatus();
      }
    )
    // Get all submissions
    .get(
      '/submissions',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new AdminController(c).getAllSubmissions();
      }
    )
    // Get submission by ID
    .get(
      '/submissions/:submissionId',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new AdminController(c).getSubmissionById();
      }
    )
    // Update submission status
    .put(
      '/submissions/:submissionId/status',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', updateSubmissionStatusSchema),
      async (c) => {
        return new AdminController(c).updateSubmissionStatus();
      }
    )
    // Approve submission
    .post(
      '/submissions/:submissionId/approve',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', approveSubmissionSchema),
      async (c) => {
        return new AdminController(c).approveSubmission();
      }
    )
    // Reject submission
    .post(
      '/submissions/:submissionId/reject',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectSubmissionSchema),
      async (c) => {
        return new AdminController(c).rejectSubmission();
      }
    )
    // Generate letter
    .post(
      '/submissions/:submissionId/generate-letter',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', generateLetterSchema),
      async (c) => {
        return new AdminController(c).generateLetter();
      }
    )
    // Get statistics
    .get(
      '/statistics',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new AdminController(c).getStatistics();
      }
    )
    // Update penilaian criteria (admin)
    .put(
      '/penilaian/kriteria',
      zValidator('json', updatePenilaianKriteriaSchema),
      async (c) => {
        return new PenilaianController().updateKriteria(c);
      }
    );

  return admin;
};
