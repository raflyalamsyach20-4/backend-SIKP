import { Context } from 'hono';
import { AdminService } from '@/services/admin.service';
import { createResponse, handleError } from '@/utils/helpers';
import { ZodError } from 'zod';
import type { JWTPayload } from '@/types';
import {
  rejectSubmissionSchema,
  approveSubmissionSchema,
  generateLetterSchema,
  updateSubmissionStatusSchema,
} from '@/schemas/admin.schema';

export class AdminController {
  constructor(private adminService: AdminService) {}

  getDashboard = async (c: Context) => {
    try {
      const dashboard = await this.adminService.getDashboard();
      return c.json(createResponse(true, 'Admin dashboard retrieved', dashboard));
    } catch (error) {
      return handleError(c, error, 'Failed to get admin dashboard');
    }
  };

  getAllSubmissions = async (c: Context) => {
    try {
      const submissions = await this.adminService.getAllSubmissions();
      
      console.log('[AdminController.getAllSubmissions] Response:', {
        count: submissions.length,
        firstSubmission: submissions[0] ? {
          id: submissions[0].id,
          hasDocuments: !!submissions[0].documents,
          documentCount: submissions[0].documents?.length || 0,
          firstDocument: submissions[0].documents?.[0] ? {
            id: submissions[0].documents[0].id,
            type: submissions[0].documents[0].documentType,
            uploadedByUser: submissions[0].documents[0].uploadedByUser
          } : null
        } : null
      });
      
      return c.json(createResponse(true, 'OK', submissions));
    } catch (error) {
      return handleError(c, error, 'Failed to get submissions');
    }
  };

  getSubmissionsByStatus = async (c: Context) => {
    try {
      const status = c.req.param('status') as 'DRAFT' | 'PENDING_REVIEW' | 'REJECTED' | 'APPROVED';
      const submissions = await this.adminService.getSubmissionsByStatus(status);
      return c.json(createResponse(true, 'Submissions retrieved', submissions));
    } catch (error) {
      return handleError(c, error, 'Failed to get submissions');
    }
  };

  getSubmissionById = async (c: Context) => {
    try {
      const submissionId = c.req.param('submissionId');
      const submission = await this.adminService.getSubmissionById(submissionId);
      return c.json(createResponse(true, 'Submission retrieved', submission));
    } catch (error) {
      return handleError(c, error, 'Failed to get submission');
    }
  };

  /**
   * Update submission status (APPROVED or REJECTED)
   * PUT /api/admin/submissions/:submissionId/status
   * Implements BACKEND_ADMIN_APPROVE_REJECT_FLOW requirement
   */
  updateSubmissionStatus = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');
      const body = await c.req.json();
      
      console.log('[AdminController.updateSubmissionStatus] Request details:', {
        submissionId,
        userId: user.userId,
        userRole: user.role,
        body,
        url: c.req.url,
      });
      
      const validated = updateSubmissionStatusSchema.parse(body);

      const result = await this.adminService.updateSubmissionStatus(
        submissionId,
        user.userId, // ✅ Pass admin ID for audit trail
        validated.status,
        validated.rejectionReason,
        validated.documentReviews,
        validated.letterNumber,
      );

      return c.json(
        createResponse(true, 'Status submission berhasil diupdate', result),
        200
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return c.json(
          createResponse(false, 'Validation Error', { errors: error.issues }),
          400
        );
      }
      return handleError(c, error, 'Failed to update submission status');
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
        validated.documentReviews,
        validated.letterNumber,
      );

      return c.json(createResponse(true, 'Submission approved successfully', submission));
    } catch (error) {
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
        validated.reason,
        validated.documentReviews
      );

      return c.json(createResponse(true, 'Submission rejected', submission));
    } catch (error) {
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
    } catch (error) {
      return handleError(c, error, 'Failed to generate letter');
    }
  };

  getStatistics = async (c: Context) => {
    try {
      const stats = await this.adminService.getSubmissionStatistics();
      return c.json(createResponse(true, 'Statistics retrieved', stats));
    } catch (error) {
      return handleError(c, error, 'Failed to get statistics');
    }
  };
}
