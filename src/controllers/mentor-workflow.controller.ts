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
  submitMentorApprovalRequest = async (c: Context) => {
    try {
      const user = this.getUser(c);
      if (!user?.userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const { mentorName, mentorEmail, mentorPhone, companyName, position, companyAddress } = await c.req.json();
      if (!mentorName || !mentorEmail) {
        return c.json(createResponse(false, 'mentorName and mentorEmail are required'), 400);
      }

      const data = await this.workflowService.submitMentorApprovalRequest(user.userId, {
        mentorName,
        mentorEmail,
        mentorPhone,
        companyName,
        position,
        companyAddress,
      });

      return c.json(createResponse(true, 'Mentor approval request submitted', data), 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json(createResponse(false, error.message), 404);
      }
      return handleError(c, error);
    }
  };

  // Dosen/Admin endpoints
  getMentorApprovalRequests = async (c: Context) => {
    try {
      const data = await this.workflowService.listMentorApprovalRequests();
      return c.json(createResponse(true, 'Mentor approval requests retrieved', data), 200);
    } catch (error) {
      return handleError(c, error);
    }
  };

  approveMentorApprovalRequest = async (c: Context) => {
    try {
      const user = this.getUser(c);
      if (!user?.userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const requestId = c.req.param('id');
      const data = await this.workflowService.approveMentorApprovalRequest(requestId, user.userId);
      return c.json(createResponse(true, 'Mentor approval request approved', data), 200);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) return c.json(createResponse(false, error.message), 404);
        if (error.message.includes('Only pending')) return c.json(createResponse(false, error.message), 409);
        if (error.message.includes('belongs to a non-mentor')) return c.json(createResponse(false, error.message), 409);
      }
      return handleError(c, error);
    }
  };

  rejectMentorApprovalRequest = async (c: Context) => {
    try {
      const user = this.getUser(c);
      if (!user?.userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const requestId = c.req.param('id');
      const { reason } = await c.req.json();
      if (!reason) return c.json(createResponse(false, 'reason is required'), 400);

      const data = await this.workflowService.rejectMentorApprovalRequest(requestId, user.userId, reason);
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
  createMentorEmailChangeRequest = async (c: Context) => {
    try {
      const user = this.getUser(c);
      if (!user?.userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const { requestedEmail, reason } = await c.req.json();
      if (!requestedEmail) return c.json(createResponse(false, 'requestedEmail is required'), 400);

      const data = await this.workflowService.createMentorEmailChangeRequest(user.userId, requestedEmail, reason);
      return c.json(createResponse(true, 'Email change request submitted', data), 201);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) return c.json(createResponse(false, error.message), 404);
        if (error.message.includes('different')) return c.json(createResponse(false, error.message), 400);
      }
      return handleError(c, error);
    }
  };

  getMentorEmailChangeRequests = async (c: Context) => {
    try {
      const data = await this.workflowService.listMentorEmailChangeRequests();
      return c.json(createResponse(true, 'Mentor email change requests retrieved', data), 200);
    } catch (error) {
      return handleError(c, error);
    }
  };

  approveMentorEmailChangeRequest = async (c: Context) => {
    try {
      const user = this.getUser(c);
      if (!user?.userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const requestId = c.req.param('id');
      const data = await this.workflowService.approveMentorEmailChangeRequest(requestId, user.userId);
      return c.json(createResponse(true, 'Mentor email change request approved', data), 200);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) return c.json(createResponse(false, error.message), 404);
        if (error.message.includes('Only pending')) return c.json(createResponse(false, error.message), 409);
        if (error.message.includes('already in use')) return c.json(createResponse(false, error.message), 409);
      }
      return handleError(c, error);
    }
  };

  rejectMentorEmailChangeRequest = async (c: Context) => {
    try {
      const user = this.getUser(c);
      if (!user?.userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const requestId = c.req.param('id');
      const { reason } = await c.req.json();
      if (!reason) return c.json(createResponse(false, 'reason is required'), 400);

      const data = await this.workflowService.rejectMentorEmailChangeRequest(requestId, user.userId, reason);
      return c.json(createResponse(true, 'Mentor email change request rejected', data), 200);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) return c.json(createResponse(false, error.message), 404);
        if (error.message.includes('Only pending')) return c.json(createResponse(false, error.message), 409);
      }
      return handleError(c, error);
    }
  };

  // Mentor auth flow
  inviteMentor = async (c: Context) => {
    try {
      const user = this.getUser(c);
      if (!user?.userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const { email } = await c.req.json();
      if (!email) return c.json(createResponse(false, 'email is required'), 400);

      const data = await this.workflowService.inviteMentorByEmail(email, user.userId);
      return c.json(createResponse(true, 'Mentor invitation token created', data), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json(createResponse(false, error.message), 404);
      }
      return handleError(c, error);
    }
  };

  activateMentor = async (c: Context) => {
    try {
      const { token } = await c.req.json();
      if (!token) return c.json(createResponse(false, 'token is required'), 400);

      const data = await this.workflowService.activateMentor(token);
      return c.json(createResponse(true, 'Mentor activation successful', data), 200);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid activation token')) return c.json(createResponse(false, error.message), 404);
        if (error.message.includes('used') || error.message.includes('expired')) return c.json(createResponse(false, error.message), 410);
      }
      return handleError(c, error);
    }
  };

  setMentorPassword = async (c: Context) => {
    try {
      const { token, password } = await c.req.json();
      if (!token || !password) return c.json(createResponse(false, 'token and password are required'), 400);
      if (String(password).length < 6) return c.json(createResponse(false, 'password must be at least 6 characters'), 400);

      const data = await this.workflowService.setMentorPassword(token, password);
      return c.json(createResponse(true, 'Mentor password has been set', data), 200);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid activation token')) return c.json(createResponse(false, error.message), 404);
        if (error.message.includes('used') || error.message.includes('expired')) return c.json(createResponse(false, error.message), 410);
      }
      return handleError(c, error);
    }
  };

  // Dosen read-only logbook monitor
  getDosenLogbookMonitor = async (c: Context) => {
    try {
      const data = await this.workflowService.getDosenLogbookMonitor();
      return c.json(createResponse(true, 'Logbook monitor data retrieved', data), 200);
    } catch (error) {
      return handleError(c, error);
    }
  };

  getDosenLogbookMonitorByStudent = async (c: Context) => {
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
