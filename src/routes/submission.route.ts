import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import {
  createSubmissionSchema,
  updateSubmissionSchema,
  uploadDocumentSchema,
} from '@/schemas/submission.schema';
import { SubmissionController } from '@/controllers';

/**
 * Submission Routes
 * Handles submission management endpoints
 */
export const createSubmissionRoutes = () => {
  const submission = new Hono<{ Bindings: CloudflareBindings }>()
    // Apply auth middleware to all submission routes
    .use('*', authMiddleware)
    // Create submission (mahasiswa only)
    .post(
      '/',
      mahasiswaOnly,
      zValidator('query', emptyQuerySchema),
      zValidator('json', createSubmissionSchema),
      async (c) => {
        return new SubmissionController(c).createSubmission();
      }
    )
    // Get user's submissions (mahasiswa only)
    .get(
      '/my-submissions',
      mahasiswaOnly,
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SubmissionController(c).getMySubmissions();
      }
    )
    // Get submission by ID (mahasiswa + admin)
    .get(
      '/:submissionId',
      roleMiddleware(['mahasiswa', 'admin', 'kaprodi', 'wakil_dekan', 'dosen']),
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SubmissionController(c).getSubmissionById();
      }
    )
    // Update submission (mahasiswa only)
    .put(
      '/:submissionId',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', updateSubmissionSchema),
      async (c) => {
        return new SubmissionController(c).updateSubmission();
      }
    )
    .patch(
      '/:submissionId',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', updateSubmissionSchema),
      async (c) => {
        return new SubmissionController(c).updateSubmission();
      }
    )
    // Submit for review (mahasiswa only)
    .post(
      '/:submissionId/submit',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SubmissionController(c).submitForReview();
      }
    )
    .put(
      '/:submissionId/submit',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SubmissionController(c).submitForReview();
      }
    )
    // Upload document (mahasiswa only)
    .post(
      '/:submissionId/documents',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('form', uploadDocumentSchema),
      async (c) => {
        return new SubmissionController(c).uploadDocument();
      }
    )
    // Get documents (mahasiswa only)
    .get(
      '/:submissionId/documents',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SubmissionController(c).getDocuments();
      }
    )
    // Backward compatibility for frontend status endpoint
    .get(
      '/:submissionId/letter-request-status',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SubmissionController(c).getLetterRequestStatus();
      }
    )
    // Delete document (mahasiswa only)
    .delete(
      '/documents/:documentId',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SubmissionController(c).deleteDocument();
      }
    )
    // Reset to draft (mahasiswa only)
    .put(
      '/:submissionId/reset',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SubmissionController(c).resetToDraft();
      }
    );

  return submission;
};
