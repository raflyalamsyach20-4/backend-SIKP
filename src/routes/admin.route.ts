import { Hono } from 'hono';
import { AdminController } from '@/controllers/admin.controller';
import { authMiddleware, adminOnly } from '@/middlewares/auth.middleware';

export const createAdminRoutes = (adminController: AdminController) => {
  const admin = new Hono();

  // Apply auth middleware to all admin routes
  admin.use('*', authMiddleware);
  admin.use('*', adminOnly);

  // ⚠️ ORDER MATTERS: More specific routes must come BEFORE generic ones
  admin.get('/submissions/status/:status', adminController.getSubmissionsByStatus);
  admin.get('/submissions', adminController.getAllSubmissions);
  admin.get('/submissions/:submissionId', adminController.getSubmissionById);
  // PUT endpoint for updating submission status (APPROVED/REJECTED) per BACKEND_ADMIN_SUBMISSION_API_DOCUMENTATION
  admin.put('/submissions/:submissionId/status', adminController.updateSubmissionStatus);
