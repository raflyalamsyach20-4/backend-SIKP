import { Context } from 'hono';
import { AdminService } from '../services/admin.service';
import { createResponse, handleError } from '../utils/helpers';
import { ZodError } from 'zod';
import type { JWTPayload } from '../types';
import {
  rejectSubmissionSchema,
  approveSubmissionSchema,
  generateLetterSchema,
  updateSubmissionStatusSchema,
} from '../schemas/admin.schema';

export class AdminController {
  private adminService: AdminService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.adminService = new AdminService(this.c.env);
  }

  getDashboard = async () => {
    try {
      const sessionId = this.c.get('sessionId') as string;
      const dashboard = await this.adminService.getDashboard(sessionId);
      return this.c.json(createResponse(true, 'Admin dashboard retrieved', dashboard));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get admin dashboard');
    }
  };

  getAllSubmissions = async () => {
    try {
      const sessionId = this.c.get('sessionId');
      const submissions = await this.adminService.getAllSubmissions(sessionId);
      
      const first = submissions[0];
      console.log('[AdminController.getAllSubmissions] Response:', {
        count: submissions.length,
        firstSubmission: first
          ? {
              id: (first as any).id ?? null,
              hasDocuments: !!first.documents,
              documentCount: first.documents?.length ?? 0,
              firstDocument: first.documents?.[0]
                ? {
                    id: (first.documents![0] as any).id ?? null,
                    type: (first.documents![0] as any).documentType ?? null,
                    uploadedByUser: (first.documents![0] as any).uploadedByUser ?? null,
                  }
                : null,
            }
          : null,
      });
      
      return this.c.json(createResponse(true, 'OK', submissions));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get submissions');
    }
  };

  getSubmissionsByStatus = async () => {
    try {
      const status = this.c.req.param('status') as 'DRAFT' | 'PENDING_REVIEW' | 'REJECTED' | 'APPROVED';
      const sessionId = this.c.get('sessionId');
      const submissions = await this.adminService.getSubmissionsByStatus(status, sessionId);
      return this.c.json(createResponse(true, 'Submissions retrieved', submissions));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get submissions');
    }
  };

  getSubmissionById = async () => {
    try {
      const submissionId = this.c.req.param('submissionId');
      const sessionId = this.c.get('sessionId');
      const submission = await this.adminService.getSubmissionById(submissionId, sessionId);
      return this.c.json(createResponse(true, 'Submission retrieved', submission));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get submission');
    }
  };

  updateSubmissionStatus = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const submissionId = this.c.req.param('submissionId');
      const body = await this.c.req.json();
      
      console.log('[AdminController.updateSubmissionStatus] Request details:', {
        submissionId,
        userId: user.userId,
        userRole: user.role,
        body,
        url: this.c.req.url,
      });
      
      const validated = updateSubmissionStatusSchema.parse(body);

      const sessionId = this.c.get('sessionId');

      let documentReviewsRecord: Record<string, string> | undefined = undefined;
      if (validated.documentReviews) {
        documentReviewsRecord = {};
        if (Array.isArray(validated.documentReviews)) {
          for (const review of validated.documentReviews) {
            documentReviewsRecord[review.documentId] =
              review.status.toLowerCase();
          }
        } else {
          for (const [documentId, status] of Object.entries(validated.documentReviews)) {
            documentReviewsRecord[documentId] = status.toLowerCase();
          }
        }
      }

      const result = await this.adminService.updateSubmissionStatus(
        submissionId,
        user.adminId!, // ✅ Pass admin ID for audit trail
        validated.status as 'APPROVED' | 'REJECTED',
        sessionId,
        validated.rejectionReason,
        documentReviewsRecord,
        validated.letterNumber,
      );

      return this.c.json(
        createResponse(true, 'Status submission berhasil diupdate', result),
        200
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return this.c.json(
          createResponse(false, 'Validation Error', { errors: error.issues }),
          400
        );
      }
      return handleError(this.c, error, 'Failed to update submission status');
    }
  };

  approveSubmission = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const submissionId = this.c.req.param('submissionId');
      
      const body = await this.c.req.json().catch(() => ({}));
      const validated = approveSubmissionSchema.parse(body);

      const sessionId = this.c.get('sessionId');

      let documentReviewsRecord: Record<string, string> | undefined = undefined;
      if (validated.documentReviews) {
        documentReviewsRecord = {};
        if (Array.isArray(validated.documentReviews)) {
          for (const review of validated.documentReviews) {
            documentReviewsRecord[review.documentId] =
              review.status.toLowerCase();
          }
        } else {
          for (const [documentId, status] of Object.entries(validated.documentReviews)) {
            documentReviewsRecord[documentId] = status.toLowerCase();
          }
        }
      }

      const submission = await this.adminService.approveSubmission(
        submissionId,
        user.adminId!,
        sessionId,
        documentReviewsRecord,
        validated.letterNumber,
      );

      return this.c.json(createResponse(true, 'Submission approved successfully', submission));
    } catch (error) {
      return handleError(this.c, error, 'Failed to approve submission');
    }
  };

  rejectSubmission = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const submissionId = this.c.req.param('submissionId');
      const body = await this.c.req.json();
      const validated = rejectSubmissionSchema.parse(body);

      const sessionId = this.c.get('sessionId');

      let documentReviewsRecord: Record<string, string> | undefined = undefined;
      if (validated.documentReviews) {
        documentReviewsRecord = {};
        for (const review of validated.documentReviews) {
          documentReviewsRecord[review.documentId] = review.status.toLowerCase();
        }
      }

      const submission = await this.adminService.rejectSubmission(
        submissionId,
        user.adminId!,
        sessionId,
        validated.reason,
        documentReviewsRecord
      );

      return this.c.json(createResponse(true, 'Submission rejected', submission));
    } catch (error) {
      return handleError(this.c, error, 'Failed to reject submission');
    }
  };

  generateLetter = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const submissionId = this.c.req.param('submissionId');
      
      const body = await this.c.req.json().catch(() => ({}));
      const validated = generateLetterSchema.parse(body);

      const letter = await this.adminService.generateLetterForSubmission(
        submissionId,
        user.adminId!,
        (validated.format?.toLowerCase() || 'pdf') as 'pdf' | 'docx'
      );

      return this.c.json(createResponse(true, 'Letter generated successfully', letter), 201);
    } catch (error) {
      return handleError(this.c, error, 'Failed to generate letter');
    }
  };

  getStatistics = async () => {
    try {
      const stats = await this.adminService.getSubmissionStatistics();
      return this.c.json(createResponse(true, 'Statistics retrieved', stats));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get statistics');
    }
  };
}
