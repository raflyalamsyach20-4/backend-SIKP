import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import {
  createSubmissionSchema,
  updateSubmissionSchema,
  uploadDocumentSchema,
} from '@/schemas/submission.schema';

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
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.createSubmission, runtime.submissionController, [c, c.req.valid('json'), c.req.valid('query')]);
      }
    )
    // Get user's submissions (mahasiswa only)
    .get(
      '/my-submissions',
      mahasiswaOnly,
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.getMySubmissions, runtime.submissionController, [c, c.req.valid('query')]);
      }
    )
    // Get submission by ID (mahasiswa + admin)
    .get(
      '/:submissionId',
      roleMiddleware(['MAHASISWA', 'ADMIN', 'KAPRODI', 'WAKIL_DEKAN', 'DOSEN']),
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.getSubmissionById, runtime.submissionController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    // Update submission (mahasiswa only)
    .put(
      '/:submissionId',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', updateSubmissionSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.updateSubmission, runtime.submissionController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    .patch(
      '/:submissionId',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', updateSubmissionSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.updateSubmission, runtime.submissionController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    // Submit for review (mahasiswa only)
    .post(
      '/:submissionId/submit',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.submitForReview, runtime.submissionController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    .put(
      '/:submissionId/submit',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.submitForReview, runtime.submissionController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    // Upload document (mahasiswa only)
    .post(
      '/:submissionId/documents',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('form', uploadDocumentSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.uploadDocument, runtime.submissionController, [c, c.req.valid('param'), c.req.valid('form')]);
      }
    )
    // Get documents (mahasiswa only)
    .get(
      '/:submissionId/documents',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.getDocuments, runtime.submissionController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    // Backward compatibility for frontend status endpoint
    .get(
      '/:submissionId/letter-request-status',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.getLetterRequestStatus, runtime.submissionController, [
          c,
          c.req.valid('param'),
          c.req.valid('query'),
        ]);
      }
    )
    // Delete document (mahasiswa only)
    // ✅ NEW: Support frontend delete before reupload
    .delete(
      '/documents/:documentId',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.deleteDocument, runtime.submissionController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    // Reset to draft (mahasiswa only)
    .put(
      '/:submissionId/reset',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.resetToDraft, runtime.submissionController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    );

  return submission;
};
