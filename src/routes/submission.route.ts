import { Hono } from 'hono';
import { SubmissionController } from '@/controllers/submission.controller';
import { authMiddleware, mahasiswaOnly, roleMiddleware } from '@/middlewares/auth.middleware';

export const createSubmissionRoutes = (submissionController: SubmissionController) => {
  const submission = new Hono();

  // Apply auth middleware to all submission routes
  submission.use('*', authMiddleware);

  // POST / - create submission (mahasiswa only)
  submission.post('/', mahasiswaOnly, submissionController.createSubmission);

  // GET /my-submissions - get user's submissions (mahasiswa only)
  submission.get('/my-submissions', mahasiswaOnly, submissionController.getMySubmissions);

  // GET /:submissionId - get submission by id (mahasiswa + admin)
  // ⚠️ IMPORTANT: This must come BEFORE other /:submissionId routes due to Hono routing
  submission.get('/:submissionId', roleMiddleware(['MAHASISWA', 'ADMIN', 'KAPRODI', 'WAKIL_DEKAN']), submissionController.getSubmissionById);

  // PUT /:submissionId - update submission (mahasiswa only)
  submission.put('/:submissionId', mahasiswaOnly, submissionController.updateSubmission);

  // PATCH /:submissionId - update submission (mahasiswa only)
  submission.patch('/:submissionId', mahasiswaOnly, submissionController.updateSubmission);

  // POST /:submissionId/submit - submit for review (mahasiswa only)
  submission.post('/:submissionId/submit', mahasiswaOnly, submissionController.submitForReview);

  // POST /:submissionId/documents - upload document (mahasiswa only)
  submission.post('/:submissionId/documents', mahasiswaOnly, submissionController.uploadDocument);

  // GET /:submissionId/documents - get documents (mahasiswa only)
  submission.get('/:submissionId/documents', mahasiswaOnly, submissionController.getDocuments);

  return submission;
};
