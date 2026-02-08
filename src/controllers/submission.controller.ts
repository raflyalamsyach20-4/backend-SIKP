import { Context } from 'hono';
import { SubmissionService } from '@/services/submission.service';
import { createResponse, handleError } from '@/utils/helpers';
import { z } from 'zod';
import type { JWTPayload } from '@/types';

const createSubmissionSchema = z.object({
  teamId: z.string().min(1),
  letterPurpose: z.string().min(1),
  companyName: z.string().min(1),
  companyAddress: z.string().min(1),
  division: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const updateSubmissionSchema = z.object({
  letterPurpose: z.string().optional(),
  companyName: z.string().optional(),
  companyAddress: z.string().optional(),
  division: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const uploadDocumentSchema = z.object({
  documentType: z.enum(['PROPOSAL_KETUA', 'SURAT_KESEDIAAN', 'FORM_PERMOHONAN', 'KRS_SEMESTER_4', 'DAFTAR_KUMPULAN_NILAI', 'BUKTI_PEMBAYARAN_UKT']),
  memberUserId: z.string().min(1),
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

      const data = validationResult.data;
      const submission = await this.submissionService.createSubmission(
        data.teamId,
        user.userId,
        {
          letterPurpose: data.letterPurpose,
          companyName: data.companyName,
          companyAddress: data.companyAddress,
          division: data.division,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
        }
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
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');
      const submission = await this.submissionService.getSubmissionById(submissionId);

      if (!submission) {
        return c.json(createResponse(false, 'Submission not found'), 404);
      }

      // Authorization check:
      // - ADMIN/KAPRODI/WAKIL_DEKAN can view any submission
      // - MAHASISWA can only view submissions from their own team
      if (!['ADMIN', 'KAPRODI', 'WAKIL_DEKAN'].includes(user.role)) {
        // User is MAHASISWA - verify they're a member of the submission's team
        const submission_data = await (this.submissionService as any).submissionRepo.findById(submissionId);
        if (submission_data) {
          const teamRepo = (this.submissionService as any).teamRepo;
          const member = await teamRepo.findMemberByTeamAndUser(submission_data.teamId, user.userId);
          if (!member) {
            return c.json(createResponse(false, 'Forbidden: You do not have access to this submission'), 403);
          }
        }
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
            errors: validationResult.error.errors,
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
        validated.documentType as any,
        user.userId // Authenticated user for authorization and fallback
      );

      return c.json(createResponse(true, 'Document uploaded successfully', document), 201);
    } catch (error: any) {
      return handleError(c, error, 'Failed to upload document');
    }
  };

  getDocuments = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const submissionId = c.req.param('submissionId');
      const documents = await this.submissionService.getDocuments(submissionId, user.userId);

      return c.json(createResponse(true, 'Documents retrieved', documents));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get documents');
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
    } catch (error: any) {
      return handleError(c, error, 'Failed to reset submission to draft');
    }
  };
}
