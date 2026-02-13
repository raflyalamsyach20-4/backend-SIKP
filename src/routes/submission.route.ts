import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, mahasiswaOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';

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
  const submission = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  // Apply auth middleware to all submission routes
  submission.use('*', authMiddleware);

  // Create submission (mahasiswa only)
  submission.post('/', mahasiswaOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.submissionController.createSubmission(c);
  });

  // Get user's submissions (mahasiswa only)
  submission.get('/my-submissions', mahasiswaOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.submissionController.getMySubmissions(c);
  });

  // Get submission by ID (mahasiswa + admin)
  submission.get('/:submissionId', 
    roleMiddleware(['MAHASISWA', 'ADMIN', 'KAPRODI', 'WAKIL_DEKAN']), 
    async (c: Context) => {
      const container = c.get('container') as DIContainer;
      return container.submissionController.getSubmissionById(c);
    }
  );

  // Update submission (mahasiswa only)
  submission.put('/:submissionId', mahasiswaOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.submissionController.updateSubmission(c);
  });

  submission.patch('/:submissionId', mahasiswaOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.submissionController.updateSubmission(c);
  });

  // Submit for review (mahasiswa only)
  submission.post('/:submissionId/submit', mahasiswaOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.submissionController.submitForReview(c);
  });

  submission.put('/:submissionId/submit', mahasiswaOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.submissionController.submitForReview(c);
  });

  // Upload document (mahasiswa only)
  submission.post('/:submissionId/documents', mahasiswaOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.submissionController.uploadDocument(c);
  });

  // Get documents (mahasiswa only)
  submission.get('/:submissionId/documents', mahasiswaOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.submissionController.getDocuments(c);
  });

  // Reset to draft (mahasiswa only)
  submission.put('/:submissionId/reset', mahasiswaOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.submissionController.resetToDraft(c);
  });

  return submission;
};
