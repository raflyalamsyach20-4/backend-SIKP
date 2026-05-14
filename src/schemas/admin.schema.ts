import { z } from 'zod';

const documentReviewArraySchema = z.array(z.object({
  documentId: z.string(),
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().optional(),
}));

const documentReviewRecordSchema = z.record(
  z.string(),
  z.enum(['approved', 'rejected'])
);

export const rejectSubmissionSchema = z.object({
  reason: z.string().min(1, 'Alasan penolakan harus diisi'),
  documentReviews: documentReviewArraySchema.optional(),
});

export const approveSubmissionSchema = z.object({
  documentReviews: z.union([
    documentReviewArraySchema,
    documentReviewRecordSchema,
  ]).optional(),
  autoGenerateLetter: z.boolean().optional().default(false),
  letterNumber: z.string().optional(),
});

export const generateLetterSchema = z.object({
  format: z.enum(['PDF', 'DOCX']).default('PDF'),
});

export const updateSubmissionStatusSchema = z.object({
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'APPROVED']),
  rejectionReason: z.string().optional(),
  documentReviews: z.array(z.object({
    documentId: z.string(),
    status: z.enum(['APPROVED', 'REJECTED']),
    rejectionReason: z.string().optional(),
  })).optional(),
  letterNumber: z.string().optional(),
});

export const approveMentorRequestSchema = z.object({});

export const rejectMentorRequestSchema = z.object({
  reason: z.string().min(1, 'Alasan penolakan harus diisi'),
});
