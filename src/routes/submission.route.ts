import { Hono } from 'hono';
import { SubmissionController } from '@/controllers/submission.controller';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';

export const createSubmissionRoutes = (submissionController: SubmissionController) => {
  const submission = new Hono();

  // Apply auth middleware to all submission routes
  submission.use('*', authMiddleware);
  submission.use('*', mahasiswaOnly);

  submission.post('/', submissionController.createSubmission);
  submission.get('/my-submissions', submissionController.getMySubmissions);
  submission.get('/:submissionId', submissionController.getSubmissionById);
  submission.patch('/:submissionId', submissionController.updateSubmission);
  submission.post('/:submissionId/submit', submissionController.submitForReview);
  submission.post('/:submissionId/documents', submissionController.uploadDocument);
  submission.get('/:submissionId/documents', submissionController.getDocuments);

  return submission;
};
