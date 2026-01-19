import { Hono } from 'hono';
import { AdminController } from '@/controllers/admin.controller';
import { authMiddleware, adminOnly } from '@/middlewares/auth.middleware';

export const createAdminRoutes = (adminController: AdminController) => {
  const admin = new Hono();

  // Apply auth middleware to all admin routes
  admin.use('*', authMiddleware);
  admin.use('*', adminOnly);

  admin.get('/submissions', adminController.getAllSubmissions);
  admin.get('/submissions/status/:status', adminController.getSubmissionsByStatus);
  admin.get('/submissions/:submissionId', adminController.getSubmissionById);
  admin.post('/submissions/:submissionId/approve', adminController.approveSubmission);
  admin.post('/submissions/:submissionId/reject', adminController.rejectSubmission);
  admin.post('/submissions/:submissionId/generate-letter', adminController.generateLetter);
  admin.get('/statistics', adminController.getStatistics);
  

  return admin;
};
