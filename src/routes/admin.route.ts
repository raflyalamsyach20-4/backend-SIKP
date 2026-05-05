import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { AdminController } from '../controllers/admin.controller';
import { authMiddleware, staffOnly } from '../middlewares/auth.middleware';
import { 
  rejectSubmissionSchema, 
  approveSubmissionSchema, 
  generateLetterSchema, 
  updateSubmissionStatusSchema 
} from '../schemas/admin.schema';

export const createAdminRoutes = () => {
  const admin = new Hono<{ Bindings: CloudflareBindings }>();

  // Middleware for all admin routes
  admin.use('*', authMiddleware);
  admin.use('*', staffOnly);

  // Submissions Management
  admin.get('/submissions', (c) => new AdminController(c).getAllSubmissions());
  admin.get('/submissions/:submissionId', (c) => new AdminController(c).getSubmissionById());
  admin.post('/submissions/:submissionId/approve', (c) => new AdminController(c).approveSubmission());
  admin.post('/submissions/:submissionId/reject', (c) => new AdminController(c).rejectSubmission());
  admin.put('/submissions/:submissionId/status', (c) => new AdminController(c).updateSubmissionStatus());

  // Letter Generation
  admin.post('/submissions/:submissionId/generate-letter', (c) => new AdminController(c).generateLetter());

  // Dashboard & Statistics
  admin.get('/dashboard', (c) => new AdminController(c).getDashboard());
  admin.get('/statistics', (c) => new AdminController(c).getStatistics());

  return admin;
};
