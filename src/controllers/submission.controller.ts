import { Context } from 'hono';
import { SubmissionService } from '@/services/submission.service';
import { createResponse, handleError } from '@/utils/helpers';
import { z } from 'zod';
import type { JWTPayload } from '@/types';

const createSubmissionSchema = z.object({
  teamId: z.string().min(1),
});

const updateSubmissionSchema = z.object({
  companyName: z.string().optional(),
  companyAddress: z.string().optional(),
  companyPhone: z.string().optional(),
  companyEmail: z.string().email().optional(),
  companySupervisor: z.string().optional(),
  position: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

const uploadDocumentSchema = z.object({
  documentType: z.enum(['KTP', 'TRANSKRIP', 'KRS', 'PROPOSAL', 'OTHER']),
});

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
            errors: validationResult.error.errors,
          }),
          400
        );
      }

      const submission = await this.submissionService.createSubmission(
        validationResult.data.teamId,
        user.userId
      );

      return c.json(createResponse(true, 'Submission created successfully', submission), 201);
    } catch (error: any) {
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
            errors: validationResult.error.errors,
          }),
          400
        );
      }

      const validated = validationResult.data;
      const data: any = { ...validated };
      if (validated.startDate) data.startDate = new Date(validated.startDate);
      if (validated.endDate) data.endDate = new Date(validated.endDate);

      const submission = await this.submissionService.updateSubmission(
        submissionId,
        user.userId,
        data
      );

      return c.json(createResponse(true, 'Submission updated successfully', submission));
    } catch (error: any) {
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
    } catch (error: any) {
      return handleError(c, error, 'Failed to submit for review');
    }
  };

  getMySubmissions = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissions = await this.submissionService.getMySubmissions(user.userId);

      return c.json(createResponse(true, 'Submissions retrieved', submissions));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get submissions');
    }
  };

  getSubmissionById = async (c: Context) => {
    try {
      const submissionId = c.req.param('submissionId');
      const submission = await this.submissionService.getSubmissionById(submissionId);

      if (!submission) {
        return c.json(createResponse(false, 'Submission not found'), 404);
      }

      return c.json(createResponse(true, 'Submission retrieved', submission));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get submission');
    }
  };

  uploadDocument = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');
      
      const formData = await c.req.formData();
      const file = formData.get('file');
      const documentType = formData.get('documentType') as string;

      if (!file || typeof file === 'string') {
        return c.json(createResponse(false, 'No file provided or invalid file'), 400);
      }

      // Validate document type
      const validationResult = uploadDocumentSchema.safeParse({ documentType });
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Invalid document type', {
            errors: validationResult.error.errors,
          }),
          400
        );
      }

      const validated = validationResult.data;

      const document = await this.submissionService.uploadDocument(
        submissionId,
        user.userId,
        file as File,
        validated.documentType
      );

      return c.json(createResponse(true, 'Document uploaded successfully', document), 201);
    } catch (error: any) {
      return handleError(c, error, 'Failed to upload document');
    }
  };

  getDocuments = async (c: Context) => {
    try {
      const submissionId = c.req.param('submissionId');
      const documents = await this.submissionService.getDocuments(submissionId);

      return c.json(createResponse(true, 'Documents retrieved', documents));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get documents');
    }
  };
}
