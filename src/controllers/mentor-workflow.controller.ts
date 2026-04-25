import { Context } from 'hono';
import type { JWTPayload } from '@/types';
import { createResponse, handleError } from '@/utils/helpers';
import { MentorWorkflowService } from '@/services/mentor-workflow.service';

export class MentorWorkflowController {
  constructor(private workflowService: MentorWorkflowService) {}

  private getUser(c: Context): JWTPayload | null {
    return (c.get('user') as JWTPayload) ?? null;
  }

  // Mahasiswa creates mentor approval request
  submitMentorApprovalRequest = async (c: Context, validated: any) => {
    try {
      const user = this.getUser(c);
      if (!user?.profileId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const data = await this.workflowService.submitMentorApprovalRequest(user.profileId, validated);

      return c.json(createResponse(true, 'Mentor approval request submitted', data), 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json(createResponse(false, error.message), 404);
      }
      return handleError(c, error);
    }
  };

  // Dosen/Admin endpoints
  getMentorApprovalRequests = async (c: Context, _query: any) => {
    try {
      const data = await this.workflowService.listMentorApprovalRequests();
      return c.json(createResponse(true, 'Mentor approval requests retrieved', data), 200);
    } catch (error) {
      return handleError(c, error);
    }
  };

  approveMentorApprovalRequest = async (c: Context, validated: any) => {
    try {
      const user = this.getUser(c);
      if (!user?.profileId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const requestId = c.req.param('id');
      const data = await this.workflowService.approveMentorApprovalRequest(
        requestId, 
        user.profileId, 
        validated.mentorProfileId
      );
      return c.json(createResponse(true, 'Mentor approval request approved', data), 200);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) return c.json(createResponse(false, error.message), 404);
        if (error.message.includes('Only pending')) return c.json(createResponse(false, error.message), 409);
      }
      return handleError(c, error);
    }
  };

  rejectMentorApprovalRequest = async (c: Context, validated: any) => {
    try {
      const user = this.getUser(c);
      if (!user?.profileId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const requestId = c.req.param('id');
      const data = await this.workflowService.rejectMentorApprovalRequest(requestId, user.profileId, validated.reason);
      return c.json(createResponse(true, 'Mentor approval request rejected', data), 200);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) return c.json(createResponse(false, error.message), 404);
        if (error.message.includes('Only pending')) return c.json(createResponse(false, error.message), 409);
      }
      return handleError(c, error);
    }
  };

  // Mentor email change
  createMentorEmailChangeRequest = async (c: Context, validated: any) => {
    try {
      const user = this.getUser(c);
      if (!user?.profileId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const data = await this.workflowService.createMentorEmailChangeRequest(user.profileId, validated.requestedEmail, validated.reason);
      return c.json(createResponse(true, 'Email change request submitted', data), 201);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) return c.json(createResponse(false, error.message), 404);
        if (error.message.includes('different')) return c.json(createResponse(false, error.message), 400);
      }
      return handleError(c, error);
    }
  };

  getMentorEmailChangeRequests = async (c: Context, _query: any) => {
    try {
      const data = await this.workflowService.listMentorEmailChangeRequests();
      return c.json(createResponse(true, 'Mentor email change requests retrieved', data), 200);
    } catch (error) {
      return handleError(c, error);
    }
  };

  // Dosen read-only logbook monitor
  getDosenLogbookMonitor = async (c: Context, _query: any) => {
    try {
      const data = await this.workflowService.getDosenLogbookMonitor();
      return c.json(createResponse(true, 'Logbook monitor data retrieved', data), 200);
    } catch (error) {
      return handleError(c, error);
    }
  };

  getDosenLogbookMonitorByStudent = async (c: Context, _query: any) => {
    try {
      const studentId = c.req.param('studentId');
      const data = await this.workflowService.getDosenLogbookMonitorByStudent(studentId);
      return c.json(createResponse(true, 'Student logbook monitor data retrieved', data), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json(createResponse(false, error.message), 404);
      }
      return handleError(c, error);
    }
  };
}
