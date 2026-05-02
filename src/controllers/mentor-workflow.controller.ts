import { Context } from 'hono';
import type { JWTPayload } from '@/types';
import { createResponse, handleError } from '@/utils/helpers';
import { MentorWorkflowService } from '@/services/mentor-workflow.service';

type ErrorLike = {
  code?: string;
  message?: string;
  statusCode?: number;
};

type ErrorResponseStatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 500;

const toErrorLike = (value: unknown): ErrorLike => {
  if (typeof value === 'object' && value !== null) {
    return value as ErrorLike;
  }
  return {};
};

const toSafeErrorStatus = (statusCode?: number): ErrorResponseStatusCode => {
  if (
    statusCode === 400 ||
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 404 ||
    statusCode === 409 ||
    statusCode === 422
  ) {
    return statusCode;
  }
  return 500;
};

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
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to submit request',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
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
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to approve request',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
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
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to reject request',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error, 'Failed to reject request');
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
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to submit email change request',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error, 'Failed to submit email change request');
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
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
          {
            success: false,
            message: err.message || 'Failed to submit request',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(this.c, error);
    }
  };
}
