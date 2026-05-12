import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { MentorWorkflowController } from '../controllers/mentor-workflow.controller';
import { MentorController } from '../controllers/mentor.controller';
import { authMiddleware, staffOnly, mentorOnly } from '../middlewares/auth.middleware';
import { z } from 'zod';
import { rejectMentorRequestSchema } from '../schemas/admin.schema';

export const createMentorshipRoutes = () => {
  const mentorship = new Hono<{ Bindings: CloudflareBindings }>();

  mentorship.use('*', authMiddleware);

  // --- Mentor Requests (Student & Dosen PA) ---
  mentorship.post('/requests', zValidator('json', z.object({
    mentorName: z.string(),
    mentorEmail: z.string().email(),
    mentorPhone: z.string().optional(),
    companyName: z.string().optional(),
    position: z.string().optional(),
    companyAddress: z.string().optional(),
  })), (c) => new MentorWorkflowController(c).submitMentorApprovalRequest(c.req.valid('json')));

  mentorship.get('/requests/me', (c) => new MentorWorkflowController(c).getMyMentorRequest());
  mentorship.get('/requests', staffOnly, (c) => new MentorWorkflowController(c).listMentorApprovalRequests());
  mentorship.post('/requests/:id/approve', staffOnly, (c) => new MentorWorkflowController(c).approveMentorApprovalRequest());
  mentorship.post('/requests/:id/reject', staffOnly, zValidator('json', rejectMentorRequestSchema), (c) => new MentorWorkflowController(c).rejectMentorApprovalRequest(c.req.valid('json')));
  mentorship.post('/requests/:id/resubmit', zValidator('json', z.object({
    mentorName: z.string(),
    mentorEmail: z.string().email(),
    mentorPhone: z.string().optional(),
    companyName: z.string().optional(),
    position: z.string().optional(),
    companyAddress: z.string().optional(),
  })), (c) => new MentorWorkflowController(c).resubmitMentorApprovalRequest(c.req.valid('json')));

  // --- Profile & Signature (Mentor) ---
  mentorship.get('/profile', (c) => new MentorController(c).getProfile());
  mentorship.post('/profile/signature', (c) => new MentorController(c).updateSignature());

  // --- Mentees Management (Mentor) ---
  mentorship.get('/mentees', mentorOnly, (c) => new MentorController(c).getMentees());
  mentorship.get('/mentees/:studentId', mentorOnly, (c) => new MentorController(c).getMenteeById());
  mentorship.get('/mentees/:studentId/logbooks', mentorOnly, (c) => new MentorController(c).getStudentLogbooks());
  
  mentorship.post('/logbooks/:logbookId/approve', mentorOnly, (c) => new MentorController(c).approveLogbook());
  mentorship.post('/logbooks/:logbookId/reject', mentorOnly, zValidator('json', z.object({ rejectionReason: z.string() })), (c) => {
    const validated = c.req.valid('json');
    return new MentorController(c).rejectLogbook(validated);
  });
  mentorship.post('/mentees/:studentId/approve-all', mentorOnly, (c) => new MentorController(c).approveAllLogbooks());

  mentorship.post('/assessments', mentorOnly, zValidator('json', z.object({
    internshipId: z.string().optional(),
    studentUserId: z.string().optional(),
    kehadiran: z.number().min(0).max(100),
    kerjasama: z.number().min(0).max(100),
    sikapEtika: z.number().min(0).max(100),
    prestasiKerja: z.number().min(0).max(100),
    kreatifitas: z.number().min(0).max(100),
    feedback: z.string().optional(),
  })), (c) => new MentorController(c).createAssessment(c.req.valid('json')));

  mentorship.get('/assessments/me', (c) => new MentorController(c).getAssessmentForMe());
  mentorship.get('/assessments/:studentId', (c) => new MentorController(c).getAssessmentByStudent());
  mentorship.put('/assessments/:assessmentId', mentorOnly, zValidator('json', z.object({
    kehadiran: z.number().min(0).max(100).optional(),
    kerjasama: z.number().min(0).max(100).optional(),
    sikapEtika: z.number().min(0).max(100).optional(),
    prestasiKerja: z.number().min(0).max(100).optional(),
    kreatifitas: z.number().min(0).max(100).optional(),
    feedback: z.string().optional(),
  })), (c) => new MentorController(c).updateAssessment(c.req.valid('json')));

  mentorship.post('/assessments/:assessmentId/unlock', mentorOnly, (c) => new MentorController(c).unlockAssessment());

  return mentorship;
};
