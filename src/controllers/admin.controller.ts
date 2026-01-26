import { Context } from 'hono';
import { AdminService } from '@/services/admin.service';
import { createResponse, handleError } from '@/utils/helpers';
import { z } from 'zod';
import type { JWTPayload } from '@/types';

const rejectSubmissionSchema = z.object({
  reason: z.string().min(1),
});

const approveSubmissionSchema = z.object({
  autoGenerateLetter: z.boolean().optional().default(false),
});

const generateLetterSchema = z.object({
  format: z.enum(['pdf', 'docx']).optional().default('pdf'),
});

export class AdminController {
  constructor(private adminService: AdminService) {}

  getAllSubmissions = async (c: Context) => {
    try {
      const submissions = await this.adminService.getAllSubmissions();
      return c.json(createResponse(true, 'Submissions retrieved', submissions));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get submissions');
    }
  };

  getSubmissionsByStatus = async (c: Context) => {
    try {
      const status = c.req.param('status') as 'DRAFT' | 'PENDING_REVIEW' | 'REJECTED' | 'APPROVED';
      const submissions = await this.adminService.getSubmissionsByStatus(status);
      return c.json(createResponse(true, 'Submissions retrieved', submissions));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get submissions');
    }
  };

  getSubmissionById = async (c: Context) => {
    try {
      const submissionId = c.req.param('submissionId');
      const submission = await this.adminService.getSubmissionById(submissionId);
      return c.json(createResponse(true, 'Submission retrieved', submission));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get submission');
    }
  };

  approveSubmission = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');
      
      const body = await c.req.json().catch(() => ({}));
      const validated = approveSubmissionSchema.parse(body);

      const submission = await this.adminService.approveSubmission(
        submissionId, 
        user.userId,
        validated.autoGenerateLetter
      );

      return c.json(createResponse(true, 'Submission approved successfully', submission));
    } catch (error: any) {
      return handleError(c, error, 'Failed to approve submission');
    }
  };

  rejectSubmission = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');
      const body = await c.req.json();
      const validated = rejectSubmissionSchema.parse(body);

      const submission = await this.adminService.rejectSubmission(
        submissionId,
        user.userId,
        validated.reason
      );

      return c.json(createResponse(true, 'Submission rejected', submission));
    } catch (error: any) {
      return handleError(c, error, 'Failed to reject submission');
    }
  };

  generateLetter = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');
      
      const body = await c.req.json().catch(() => ({}));
      const validated = generateLetterSchema.parse(body);

      const letter = await this.adminService.generateLetterForSubmission(
        submissionId,
        user.userId,
        validated.format
      );

      return c.json(createResponse(true, 'Letter generated successfully', letter), 201);
    } catch (error: any) {
      return handleError(c, error, 'Failed to generate letter');
    }
  };

  getStatistics = async (c: Context) => {
    try {
      const stats = await this.adminService.getSubmissionStatistics();
      return c.json(createResponse(true, 'Statistics retrieved', stats));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get statistics');
    }
  };
}
