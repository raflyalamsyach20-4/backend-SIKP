import { Context } from 'hono';
import type { JWTPayload } from '@/types';
import { createResponse, handleError } from '@/utils/helpers';
import { MentorWorkflowService } from '@/services/mentor-workflow.service';

export class MentorWorkflowController {
  private workflowService: MentorWorkflowService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.workflowService = new MentorWorkflowService(this.c.env);
  }

  private getUser(): JWTPayload | null {
    return (this.c.get('user') as JWTPayload) ?? null;
  }

  // Mahasiswa creates mentor approval request
  submitMentorApprovalRequest = async (validated: any) => {
    try {
      const user = this.getUser();
      if (!user?.profileId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const data = await this.workflowService.submitMentorApprovalRequest(user.profileId, validated);

      return this.c.json(createResponse(true, 'Mentor approval request submitted', data), 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return this.c.json(createResponse(false, error.message), 404);
      }
      return handleError(this.c, error);
    }
  };

  // Dosen/Admin endpoints
  getMentorApprovalRequests = async () => {
    try {
      const data = await this.workflowService.listMentorApprovalRequests();
      return this.c.json(createResponse(true, 'Mentor approval requests retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  approveMentorApprovalRequest = async (validated: any) => {
    try {
      const user = this.getUser();
      if (!user?.profileId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const requestId = this.c.req.param('id');
      const data = await this.workflowService.approveMentorApprovalRequest(
        requestId, 
        user.profileId, 
        validated.mentorProfileId
      );
      return this.c.json(createResponse(true, 'Mentor approval request approved', data), 200);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) return this.c.json(createResponse(false, error.message), 404);
        if (error.message.includes('Only pending')) return this.c.json(createResponse(false, error.message), 409);
      }
      return handleError(this.c, error);
    }
  };

  rejectMentorApprovalRequest = async (validated: any) => {
    try {
      const user = this.getUser();
      if (!user?.profileId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const requestId = this.c.req.param('id');
      const data = await this.workflowService.rejectMentorApprovalRequest(requestId, user.profileId, validated.reason);
      return this.c.json(createResponse(true, 'Mentor approval request rejected', data), 200);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) return this.c.json(createResponse(false, error.message), 404);
        if (error.message.includes('Only pending')) return this.c.json(createResponse(false, error.message), 409);
      }
      return handleError(this.c, error);
    }
  };

  // Mentor email change
  createMentorEmailChangeRequest = async (validated: any) => {
    try {
      const user = this.getUser();
      if (!user?.profileId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const data = await this.workflowService.createMentorEmailChangeRequest(user.profileId, validated.requestedEmail, validated.reason);
      return this.c.json(createResponse(true, 'Email change request submitted', data), 201);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) return this.c.json(createResponse(false, error.message), 404);
        if (error.message.includes('different')) return this.c.json(createResponse(false, error.message), 400);
      }
      return handleError(this.c, error);
    }
  };

  getMentorEmailChangeRequests = async () => {
    try {
      const data = await this.workflowService.listMentorEmailChangeRequests();
      return this.c.json(createResponse(true, 'Mentor email change requests retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  // Dosen read-only logbook monitor
  getDosenLogbookMonitor = async () => {
    try {
      const data = await this.workflowService.getDosenLogbookMonitor();
      return this.c.json(createResponse(true, 'Logbook monitor data retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  getDosenLogbookMonitorByStudent = async () => {
    try {
      const studentId = this.c.req.param('studentId');
      const data = await this.workflowService.getDosenLogbookMonitorByStudent(studentId);
      return this.c.json(createResponse(true, 'Student logbook monitor data retrieved', data), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return this.c.json(createResponse(false, error.message), 404);
      }
      return handleError(this.c, error);
    }
  };
}
