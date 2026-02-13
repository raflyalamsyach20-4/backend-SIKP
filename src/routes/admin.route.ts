import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, adminOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';

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
  const admin = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  // Apply auth middleware to all admin routes
  admin.use('*', authMiddleware);
  admin.use('*', adminOnly);

  // Get submissions by status (more specific route first)
  admin.get('/submissions/status/:status', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.adminController.getSubmissionsByStatus(c);
  });

  // Get all submissions
  admin.get('/submissions', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.adminController.getAllSubmissions(c);
  });

  // Get submission by ID
  admin.get('/submissions/:submissionId', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.adminController.getSubmissionById(c);
  });

  // Update submission status
  admin.put('/submissions/:submissionId/status', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.adminController.updateSubmissionStatus(c);
  });

  // Approve submission
  admin.post('/submissions/:submissionId/approve', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.adminController.approveSubmission(c);
  });

  // Reject submission
  admin.post('/submissions/:submissionId/reject', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.adminController.rejectSubmission(c);
  });

  // Generate letter
  admin.post('/submissions/:submissionId/generate-letter', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.adminController.generateLetter(c);
  });

  // Get statistics
  admin.get('/statistics', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.adminController.getStatistics(c);
  });

  return admin;
};
