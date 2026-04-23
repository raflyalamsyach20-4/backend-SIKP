import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, mahasiswaOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import {
  createSubmissionSchema,
  updateSubmissionSchema,
  uploadDocumentSchema,
} from '@/schemas/submission.schema';

/**
 * Extended context variables
 */
type Variables = {
  container: DIContainer;
};

/**
 * Submission Routes
 * Handles submission management endpoints
 */
export const createSubmissionRoutes = () => {
  const submission = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    // Apply auth middleware to all submission routes
    .use('*', authMiddleware)
    // Create submission (mahasiswa only)
    .post(
      '/',
      mahasiswaOnly,
      zValidator('query', emptyQuerySchema),
      zValidator('json', createSubmissionSchema),
      withContainer((container, c) => container.submissionController.createSubmission(c))
    )
    // Get user's submissions (mahasiswa only)
    .get(
      '/my-submissions',
      mahasiswaOnly,
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.submissionController.getMySubmissions(c))
    )
    // Get submission by ID (mahasiswa + admin)
    .get(
      '/:submissionId',
      roleMiddleware(['MAHASISWA', 'ADMIN', 'KAPRODI', 'WAKIL_DEKAN', 'DOSEN']),
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.submissionController.getSubmissionById(c))
    )
    // Update submission (mahasiswa only)
    .put(
      '/:submissionId',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', updateSubmissionSchema),
      withContainer((container, c) => container.submissionController.updateSubmission(c))
    )
    .patch(
      '/:submissionId',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', updateSubmissionSchema),
      withContainer((container, c) => container.submissionController.updateSubmission(c))
    )
    // Submit for review (mahasiswa only)
    .post(
      '/:submissionId/submit',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.submissionController.submitForReview(c))
    )
    .put(
      '/:submissionId/submit',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.submissionController.submitForReview(c))
    )
    // Upload document (mahasiswa only)
    .post(
      '/:submissionId/documents',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('form', uploadDocumentSchema),
      withContainer((container, c) => container.submissionController.uploadDocument(c))
    )
    // Get documents (mahasiswa only)
    .get(
      '/:submissionId/documents',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.submissionController.getDocuments(c))
    )
    // Backward compatibility for frontend status endpoint
    .get(
      '/:submissionId/letter-request-status',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.submissionController.getLetterRequestStatus(c))
    )
    // Delete document (mahasiswa only)
    // ✅ NEW: Support frontend delete before reupload
    .delete(
      '/documents/:documentId',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.submissionController.deleteDocument(c))
    )
    // Reset to draft (mahasiswa only)
    .put(
      '/:submissionId/reset',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.submissionController.resetToDraft(c))
    );

  return submission;
};
