import { Context } from 'hono';
import { MentorWorkflowService } from '../services/mentor-workflow.service';
import { createResponse, handleError } from '../utils/helpers';
import type { JWTPayload } from '@/types';

export class MentorWorkflowController {
  private service: MentorWorkflowService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.service = new MentorWorkflowService(this.c.env);
  }

  private getUserId(): string | null {
    const user = this.c.get('user') as JWTPayload;
    // If we need profileId for Dosen PA comparisons, we should return profileId if they are DOSEN.
    if (user?.role === 'dosen' || user?.role === 'admin' || user?.role === 'wakil_dekan') {
      return user?.profileId || user?.userId || null;
    }
    // Default for MAHASISWA
    return user?.mahasiswaId || user?.userId || null;
  }

  submitMentorApprovalRequest = async (validated: any) => {
    try {
      const studentUserId = this.getUserId();
      if (!studentUserId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const request = await this.service.submitMentorApprovalRequest(studentUserId, validated);
      return this.c.json(createResponse(true, 'Mentor approval request submitted', request), 201);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  getMyMentorRequest = async () => {
    try {
      const studentUserId = this.getUserId();
      const sessionId = (this.c.get('sessionId') as string) || '';
      if (!studentUserId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const requests = await this.service.getMyMentorRequest(studentUserId, sessionId);
      return this.c.json(createResponse(true, 'Your mentor approval requests retrieved', requests), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  listMentorApprovalRequests = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const reviewerUserId = this.getUserId();
      const sessionId = (this.c.get('sessionId') as string) || '';
      
      if (!reviewerUserId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const requests = await this.service.listMentorApprovalRequests(reviewerUserId, sessionId, user?.role);
      return this.c.json(createResponse(true, 'Mentor approval requests retrieved', requests), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  approveMentorApprovalRequest = async () => {
    try {
      const requestId = this.c.req.param('id');
      const reviewerUserId = this.getUserId();
      const sessionId = (this.c.get('sessionId') as string) || '';

      if (!reviewerUserId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const result = await this.service.approveMentorApprovalRequest(requestId, reviewerUserId, sessionId);
      return this.c.json(createResponse(true, 'Mentor approval request approved', result), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  rejectMentorApprovalRequest = async (validated: any) => {
    try {
      const requestId = this.c.req.param('id');
      const reviewerUserId = this.getUserId();
      if (!reviewerUserId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const request = await this.service.rejectMentorApprovalRequest(requestId, reviewerUserId, validated.reason);
      return this.c.json(createResponse(true, 'Mentor approval request rejected', request), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  resubmitMentorApprovalRequest = async (validated: any) => {
    try {
      const requestId = this.c.req.param('id');
      const studentUserId = this.getUserId();
      if (!studentUserId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      // Service akan reset rejectionReason ke null secara otomatis
      const request = await this.service.resubmitMentorApprovalRequest(requestId, studentUserId, validated);
      return this.c.json(createResponse(true, 'Mentor approval request resubmitted', request), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  createMentorEmailChangeRequest = async (validated: any) => {
    try {
      const mentorId = this.getUserId();
      if (!mentorId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const req = await this.service.createMentorEmailChangeRequest(mentorId, validated.requestedEmail, validated.reason);
      return this.c.json(createResponse(true, 'Email change request submitted', req), 201);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  listMentorEmailChangeRequests = async () => {
    try {
      const reqs = await this.service.listMentorEmailChangeRequests();
      return this.c.json(createResponse(true, 'Email change requests retrieved', reqs), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  approveMentorEmailChangeRequest = async () => {
    try {
      const requestId = this.c.req.param('id');
      const reviewerUserId = this.getUserId();
      if (!reviewerUserId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const result = await this.service.approveMentorEmailChangeRequest(requestId, reviewerUserId);
      return this.c.json(createResponse(true, 'Email change request approved', result), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  rejectMentorEmailChangeRequest = async (validated: any) => {
    try {
      const requestId = this.c.req.param('id');
      const reviewerUserId = this.getUserId();
      if (!reviewerUserId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const result = await this.service.rejectMentorEmailChangeRequest(requestId, reviewerUserId, validated.reason);
      return this.c.json(createResponse(true, 'Email change request rejected', result), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  getDosenLogbookMonitor = async () => {
    try {
      const data = await this.service.getDosenLogbookMonitor();
      return this.c.json(createResponse(true, 'Logbook monitor data retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  getDosenLogbookMonitorByStudent = async () => {
    try {
      const studentUserId = this.c.req.param('studentUserId');
      const data = await this.service.getDosenLogbookMonitorByStudent(studentUserId);
      return this.c.json(createResponse(true, 'Student logbook monitor data retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };
}
