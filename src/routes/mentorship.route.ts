import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly, pembimbingLapanganOnly } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { 
  submitMentorApprovalRequestSchema, 
  rejectLogbookSchema, 
  createAssessmentSchema, 
  updateAssessmentSchema 
} from '@/validation';
import { emptyQuerySchema } from '@/schemas/common.schema';
import { MentorController } from '@/controllers/mentor.controller';
import { MentorWorkflowController } from '@/controllers/mentor-workflow.controller';

/**
 * Mentorship Routes
 */
export const createMentorshipRoutes = () => {
  const mentorship = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    // Student Request for Mentor
    .post('/requests', mahasiswaOnly, zValidator('json', submitMentorApprovalRequestSchema), async (c) => {
      return new MentorWorkflowController(c).submitMentorApprovalRequest(c.req.valid('json'));
    })
    .post('/email-change-requests', pembimbingLapanganOnly, zValidator('json', emptyQuerySchema), async (c) => {
      return new MentorWorkflowController(c).createMentorEmailChangeRequest(c.req.valid('json'));
    })

    // Mentee Management
    .get('/mentees', pembimbingLapanganOnly, zValidator('query', emptyQuerySchema), async (c) => {
      return new MentorController(c).getMentees();
    })
    .get('/mentees/:studentId', pembimbingLapanganOnly, zValidator('query', emptyQuerySchema), async (c) => {
      return new MentorController(c).getMenteeById();
    })
    .get('/mentees/:studentId/logbooks', pembimbingLapanganOnly, zValidator('query', emptyQuerySchema), async (c) => {
      return new MentorController(c).getStudentLogbooks();
    })
    .post('/logbooks/:logbookId/approve', pembimbingLapanganOnly, zValidator('json', emptyQuerySchema), async (c) => {
      return new MentorController(c).approveLogbook();
    })
    .post('/logbooks/:logbookId/reject', pembimbingLapanganOnly, zValidator('json', rejectLogbookSchema), async (c) => {
      return new MentorController(c).rejectLogbook(c.req.valid('json'));
    })
    .post('/mentees/:studentId/approve-all', pembimbingLapanganOnly, zValidator('json', emptyQuerySchema), async (c) => {
      return new MentorController(c).approveAllLogbooks();
    })
    // Assessments
    .post('/assessments', pembimbingLapanganOnly, zValidator('json', createAssessmentSchema), async (c) => {
      return new MentorController(c).createAssessment(c.req.valid('json'));
    })
    .get('/assessments/:studentId', pembimbingLapanganOnly, zValidator('query', emptyQuerySchema), async (c) => {
      return new MentorController(c).getAssessmentByStudent();
    })
    .put('/assessments/:assessmentId', pembimbingLapanganOnly, zValidator('json', updateAssessmentSchema), async (c) => {
      return new MentorController(c).updateAssessment(c.req.valid('json'));
    });

  return mentorship;
};
