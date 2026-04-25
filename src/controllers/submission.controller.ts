import { Context } from 'hono';
import { SubmissionService } from '@/services/submission.service';
import { createResponse, handleError } from '@/utils/helpers';
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
  private submissionService: SubmissionService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.submissionService = new SubmissionService(this.c.env);
  }

  createSubmission = async () => {
    try {
      const user = this.c.get('user');
      const body = await this.c.req.json();
      
      const validationResult = createSubmissionSchema.safeParse(body);
      if (!validationResult.success) {
        return this.c.json(
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
        user.mahasiswaId!,
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
        return this.c.json(
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

      return this.c.json(createResponse(true, 'Submission created', result.submission), 201);
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
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
      return handleError(this.c, error, 'Failed to create submission');
    }
  };

  updateSubmission = async () => {
    try {
      const user = this.c.get('user');
      const submissionId = this.c.req.param('submissionId');
      const body = await this.c.req.json();
      
      const validationResult = updateSubmissionSchema.safeParse(body);
      if (!validationResult.success) {
        return this.c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const validated = validationResult.data;
      const data: any = { ...validated };
      if (validated.companyPhone !== undefined) {
        const normalizedCompanyPhone = validated.companyPhone.trim();
        data.companyPhone = normalizedCompanyPhone || undefined;
      }
      if (validated.companyBusinessType !== undefined) {
        const normalizedCompanyBusinessType = validated.companyBusinessType.trim();
        data.companyBusinessType = normalizedCompanyBusinessType || undefined;
      }

      const submission = await this.submissionService.updateSubmission(
        submissionId,
        user.mahasiswaId!,
        data
      );

      return this.c.json(createResponse(true, 'Submission updated successfully', submission));
    } catch (error) {
      return handleError(this.c, error, 'Failed to update submission');
    }
  };

  submitForReview = async () => {
    try {
      const user = this.c.get('user');
      const submissionId = this.c.req.param('submissionId');

      const submission = await this.submissionService.submitForReview(
        submissionId,
        user.mahasiswaId!
      );

      return this.c.json(createResponse(true, 'Submission submitted for review', submission));
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
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
      return handleError(this.c, error, 'Failed to submit for review');
    }
  };

  getMySubmissions = async () => {
    try {
      const user = this.c.get('user');
      const submissions = await this.submissionService.getMySubmissions(user.mahasiswaId!);

      return this.c.json(createResponse(true, 'Submissions retrieved', submissions));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get submissions');
    }
  };

  getSubmissionById = async () => {
    try {
      const user = this.c.get('user');
      const submissionId = this.c.req.param('submissionId');
      const submission = await this.submissionService.getSubmissionById(submissionId);

      if (!submission) {
        return this.c.json(createResponse(false, 'Submission not found'), 404);
      }

      if (!['ADMIN', 'KAPRODI', 'WAKIL_DEKAN', 'DOSEN'].includes(user.role)) {
        const canAccess = await this.submissionService.canAccessSubmission(submissionId, user.mahasiswaId!);
        if (!canAccess) {
          return this.c.json(createResponse(false, 'Forbidden: You do not have access to this submission'), 403);
        }
      }

      return this.c.json(createResponse(true, 'Submission retrieved', submission));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get submission');
    }
  };

  getLetterRequestStatus = async () => {
    try {
      const user = this.c.get('user');
      const submissionId = this.c.req.param('submissionId');

      const result = await this.submissionService.getLetterRequestStatus(submissionId, user.mahasiswaId!);

      return this.c.json(createResponse(true, 'Status ajuan surat berhasil diambil', result));
    } catch (error) {
      const err = toErrorLike(error);
      if (err.statusCode === 403) {
        return this.c.json(createResponse(false, err.message || 'Anda tidak memiliki akses ke submission ini', null), 403);
      }
      return handleError(this.c, error, 'Failed to get letter request status');
    }
  };

  uploadDocument = async () => {
    try {
      const user = this.c.get('user');
      const submissionId = this.c.req.param('submissionId');
      
      const formData = await this.c.req.formData();
      const file = formData.get('file');
      const documentType = formData.get('documentType') as string;
      const memberUserId = formData.get('memberUserId') as string;
      let uploadedByUserId = formData.get('uploadedByUserId') as string | null;

      if (!file || typeof file === 'string') {
        return this.c.json(createResponse(false, 'No file provided or invalid file'), 400);
      }

      const validationResult = uploadDocumentSchema.safeParse({ 
        documentType,
        memberUserId
      });
      if (!validationResult.success) {
        return this.c.json(
          createResponse(false, 'Invalid document type or memberUserId', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const validated = validationResult.data;
      const finalUploadedByUserId = uploadedByUserId && uploadedByUserId.trim() 
        ? uploadedByUserId 
        : validated.memberUserId;

      const document = await this.submissionService.uploadDocument(
        submissionId,
        finalUploadedByUserId,
        validated.memberUserId,
        file as File,
        validated.documentType,
        user.mahasiswaId!
      );

      return this.c.json(createResponse(true, 'Document uploaded successfully', document), 201);
    } catch (error) {
      const err = toErrorLike(error);
      if (err.code) {
        return this.c.json(
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
      return handleError(this.c, error, 'Failed to upload document');
    }
  };

  getDocuments = async () => {
    try {
      const user = this.c.get('user');
      const submissionId = this.c.req.param('submissionId');
      const documents = await this.submissionService.getDocuments(submissionId, user.mahasiswaId!);

      return this.c.json(createResponse(true, 'Documents retrieved', documents));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get documents');
    }
  };

  deleteDocument = async () => {
    try {
      const user = this.c.get('user');
      const documentId = this.c.req.param('documentId');

      const result = await this.submissionService.deleteDocument(documentId, user.mahasiswaId!);

      return this.c.json(createResponse(true, result.message, null));
    } catch (error) {
      return handleError(this.c, error, 'Failed to delete document');
    }
  };

  resetToDraft = async () => {
    try {
      const user = this.c.get('user');
      const submissionId = this.c.req.param('submissionId');

      const submission = await this.submissionService.resetToDraft(
        submissionId,
        user.mahasiswaId!
      );

      return this.c.json(createResponse(true, 'Submission reset to draft', submission));
    } catch (error) {
      return handleError(this.c, error, 'Failed to reset submission to draft');
    }
  };
}
