import { Context } from 'hono';
import { SubmissionService } from '@/services/submission.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';
import {
  createSubmissionSchema,
  updateSubmissionSchema,
  uploadDocumentSchema,
} from '@/schemas/submission.schema';

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

export class SubmissionController {
  constructor(private submissionService: SubmissionService) {}

  createSubmission = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const body = await c.req.json();
      
      // Validate request body
      const validationResult = createSubmissionSchema.safeParse(body);
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const data = validationResult.data;
      const normalizedCompanyPhone = data.companyPhone?.trim();
      const normalizedCompanyBusinessType = data.companyBusinessType?.trim();
      const result = await this.submissionService.createSubmission(
        data.teamId,
        user.userId,
        {
          letterPurpose: data.letterPurpose,
          companyName: data.companyName,
          companyAddress: data.companyAddress,
          companyPhone: normalizedCompanyPhone || undefined,
          companyBusinessType: normalizedCompanyBusinessType || undefined,
          division: data.division,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
        }
      );

      if (result.alreadyExists) {
        return c.json(
          {
            success: true,
            message: 'Submission already exists',
            data: result.submission,
            meta: {
              alreadyExists: true,
            },
          },
          200
        );
      }

      return c.json(createResponse(true, 'Submission created', result.submission), 201);
    } catch (error) {
      const err = toErrorLike(error);

      if (err.code) {
        return c.json(
          {
            success: false,
            message: err.message || 'Failed to create submission',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }

      return handleError(c, error, 'Failed to create submission');
    }
  };

  updateSubmission = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');
      const body = await c.req.json();
      
      // Validate request body
      const validationResult = updateSubmissionSchema.safeParse(body);
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const validated = validationResult.data;
      const data: {
        letterPurpose?: string;
        companyName?: string;
        companyAddress?: string;
        companyPhone?: string;
        companyBusinessType?: string;
        division?: string;
        startDate?: string;
        endDate?: string;
      } = { ...validated };
      if (validated.companyPhone !== undefined) {
        const normalizedCompanyPhone = validated.companyPhone.trim();
        data.companyPhone = normalizedCompanyPhone || undefined;
      }
      if (validated.companyBusinessType !== undefined) {
        const normalizedCompanyBusinessType = validated.companyBusinessType.trim();
        data.companyBusinessType = normalizedCompanyBusinessType || undefined;
      }
      if (validated.startDate) data.startDate = validated.startDate;
      if (validated.endDate) data.endDate = validated.endDate;

      const submission = await this.submissionService.updateSubmission(
        submissionId,
        user.userId,
        data
      );

      return c.json(createResponse(true, 'Submission updated successfully', submission));
    } catch (error) {
      return handleError(c, error, 'Failed to update submission');
    }
  };

  submitForReview = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');

      const submission = await this.submissionService.submitForReview(
        submissionId,
        user.userId
      );

      return c.json(createResponse(true, 'Submission submitted for review', submission));
    } catch (error) {
      const err = toErrorLike(error);

      if (err.code) {
        return c.json(
          {
            success: false,
            message: err.message || 'Failed to submit for review',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(c, error, 'Failed to submit for review');
    }
  };

  getMySubmissions = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissions = await this.submissionService.getMySubmissions(user.userId);

      return c.json(createResponse(true, 'Submissions retrieved', submissions));
    } catch (error) {
      return handleError(c, error, 'Failed to get submissions');
    }
  };

  getSubmissionById = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');
      const submission = await this.submissionService.getSubmissionById(submissionId);

      if (!submission) {
        return c.json(createResponse(false, 'Submission not found'), 404);
      }

      // Authorization check:
      // - ADMIN/KAPRODI/WAKIL_DEKAN can view all submissions
      // - MAHASISWA can only view submissions from their own team
      if (!['ADMIN', 'KAPRODI', 'WAKIL_DEKAN', 'DOSEN'].includes(user.role)) {
        const canAccess = await this.submissionService.canAccessSubmission(submissionId, user.userId);
        if (!canAccess) {
          return c.json(createResponse(false, 'Forbidden: You do not have access to this submission'), 403);
        }
      }

      return c.json(createResponse(true, 'Submission retrieved', submission));
    } catch (error) {
      return handleError(c, error, 'Failed to get submission');
    }
  };

  /**
   * Mahasiswa: Get latest surat request status matrix for all team members.
   * GET /api/mahasiswa/submissions/:submissionId/letter-request-status
   */
  getLetterRequestStatus = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');

      const result = await this.submissionService.getLetterRequestStatus(submissionId, user.userId);

      return c.json(createResponse(true, 'Status ajuan surat berhasil diambil', result));
    } catch (error) {
      const err = toErrorLike(error);

      if (err.statusCode === 403) {
        return c.json(createResponse(false, err.message || 'Anda tidak memiliki akses ke submission ini', null), 403);
      }

      return handleError(c, error, 'Failed to get letter request status');
    }
  };

  uploadDocument = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');
      
      const formData = await c.req.formData();
      const file = formData.get('file');
      const documentType = formData.get('documentType') as string;
      const memberUserId = formData.get('memberUserId') as string;
      let uploadedByUserId = formData.get('uploadedByUserId') as string | null;

      if (!file || typeof file === 'string') {
        return c.json(createResponse(false, 'No file provided or invalid file'), 400);
      }

      // Validate document type and memberUserId
      const validationResult = uploadDocumentSchema.safeParse({ 
        documentType,
        memberUserId
      });
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Invalid document type or memberUserId', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const validated = validationResult.data;

      // ✅ FIX: Fallback uploadedByUserId to memberUserId if not provided
      const finalUploadedByUserId = uploadedByUserId && uploadedByUserId.trim() 
        ? uploadedByUserId 
        : validated.memberUserId;

      const document = await this.submissionService.uploadDocument(
        submissionId,
        finalUploadedByUserId,
        validated.memberUserId,
        file as File,
        validated.documentType,
        user.userId // Authenticated user for authorization and fallback
      );

      return c.json(createResponse(true, 'Document uploaded successfully', document), 201);
    } catch (error) {
      const err = toErrorLike(error);

      if (err.code) {
        return c.json(
          {
            success: false,
            message: err.message || 'Failed to upload document',
            error: {
              code: err.code,
            },
            data: null,
          },
          toSafeErrorStatus(err.statusCode)
        );
      }
      return handleError(c, error, 'Failed to upload document');
    }
  };

  getDocuments = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');
      const documents = await this.submissionService.getDocuments(submissionId, user.userId);

      return c.json(createResponse(true, 'Documents retrieved', documents));
    } catch (error) {
      return handleError(c, error, 'Failed to get documents');
    }
  };

  /**
   * Delete a submission document
   * Endpoint: DELETE /api/submissions/documents/:documentId
   * Only allowed for REJECTED documents or documents in DRAFT submissions
   */
  deleteDocument = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const documentId = c.req.param('documentId');

      console.log('[SubmissionController.deleteDocument] Request:', {
        documentId,
        userId: user.userId,
      });

      const result = await this.submissionService.deleteDocument(documentId, user.userId);

      console.log('[SubmissionController.deleteDocument] Success');
      return c.json(createResponse(true, result.message, null));
    } catch (error) {
      return handleError(c, error, 'Failed to delete document');
    }
  };

  /**
   * Reset submission from REJECTED to DRAFT
   * Allows team members to resubmit after rejection
   * Endpoint: PUT /api/submissions/{id}/status/reset-draft
   */
  resetToDraft = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');

      console.log('[SubmissionController.resetToDraft] Request:', {
        submissionId,
        userId: user.userId,
      });

      const submission = await this.submissionService.resetToDraft(
        submissionId,
        user.userId
      );

      console.log('[SubmissionController.resetToDraft] Success');
      return c.json(createResponse(true, 'Submission reset to draft', submission));
    } catch (error) {
      return handleError(c, error, 'Failed to reset submission to draft');
    }
  };
}
