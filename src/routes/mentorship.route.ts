import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly, pembimbingLapanganOnly } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { createDbClient } from '@/db';
import { LogbookRepository } from '@/repositories/logbook.repository';
import { MentorRepository } from '@/repositories/mentor.repository';
import { MentorService } from '@/services/mentor.service';
import { MentorController } from '@/controllers/mentor.controller';
import { MentorWorkflowRepository } from '@/repositories/mentor-workflow.repository';
import { MentorWorkflowService } from '@/services/mentor-workflow.service';
import { MentorWorkflowController } from '@/controllers/mentor-workflow.controller';

import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { 
  submitMentorApprovalRequestSchema, 
  mentorProfileSchema, 
  mentorSignatureSchema, 
  rejectLogbookSchema, 
  createAssessmentSchema, 
  updateAssessmentSchema 
} from '@/validation';
import { emptyQuerySchema, emptyFormSchema } from '@/schemas/common.schema';

export const createMentorshipRoutes = () => {
  return new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    // Student Request for Mentor
    .post('/requests', mahasiswaOnly, zValidator('json', submitMentorApprovalRequestSchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorWorkflowController.submitMentorApprovalRequest, runtime.mentorWorkflowController, [c, c.req.valid('json')]);
    })
    .post('/email-change-requests', pembimbingLapanganOnly, zValidator('json', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorWorkflowController.createMentorEmailChangeRequest, runtime.mentorWorkflowController, [c, c.req.valid('json')]);
    })

    // Mentee Management
    .get('/mentees', pembimbingLapanganOnly, zValidator('query', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorController.getMentees, runtime.mentorController, [c, c.req.valid('query')]);
    })
    .get('/mentees/:studentId', pembimbingLapanganOnly, zValidator('query', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorController.getMenteeById, runtime.mentorController, [c, c.req.valid('query')]);
    })
    .get('/mentees/:studentId/logbooks', pembimbingLapanganOnly, zValidator('query', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorController.getStudentLogbooks, runtime.mentorController, [c, c.req.valid('query')]);
    })
    .post('/logbooks/:logbookId/approve', pembimbingLapanganOnly, zValidator('json', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorController.approveLogbook, runtime.mentorController, [c, c.req.valid('json')]);
    })
    .post('/logbooks/:logbookId/reject', pembimbingLapanganOnly, zValidator('json', rejectLogbookSchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorController.rejectLogbook, runtime.mentorController, [c, c.req.valid('json')]);
    })
    .post('/mentees/:studentId/approve-all', pembimbingLapanganOnly, zValidator('json', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorController.approveAllLogbooks, runtime.mentorController, [c, c.req.valid('json')]);
    })
    // Assessments
    .post('/assessments', pembimbingLapanganOnly, zValidator('json', createAssessmentSchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorController.createAssessment, runtime.mentorController, [c, c.req.valid('json')]);
    })
    .get('/assessments/:studentId', pembimbingLapanganOnly, zValidator('query', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorController.getAssessmentByStudent, runtime.mentorController, [c, c.req.valid('query')]);
    })
    .put('/assessments/:assessmentId', pembimbingLapanganOnly, zValidator('json', updateAssessmentSchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorController.updateAssessment, runtime.mentorController, [c, c.req.valid('json')]);
    });
};
