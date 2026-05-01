import { z } from 'zod';

export const rejectSubmissionSchema = z.object({
  documentReviews: z.record(z.string(), z.enum(['approved', 'rejected'])).optional(),
  reason: z.string().min(1),
});

export const approveSubmissionSchema = z.object({
  documentReviews: z.record(z.string(), z.enum(['approved', 'rejected'])).optional(),
  autoGenerateLetter: z.boolean().optional().default(false),
  letterNumber: z.string().optional(),
});

export const generateLetterSchema = z.object({
  format: z.enum(['pdf', 'docx']).optional().default('pdf'),
});

export const updateSubmissionStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']).describe('Status to update to'),
  rejectionReason: z.string().optional().describe('Reason for rejection (required if status is REJECTED)'),
  letterNumber: z.string().optional().describe('Nomor surat (required if status is APPROVED)'),
  documentReviews: z.record(z.string(), z.enum(['approved', 'rejected'])).describe('Document review statuses per document ID'),
});

export const updatePenilaianKriteriaSchema = z.object({
  kriteria: z.array(
    z
      .object({
        category: z.string().min(1),
        weight: z.number(),
        maxScore: z.number(),
      })
      .passthrough()
  ).min(1),
});

export const approveMentorRequestSchema = z.object({
  mentorProfileId: z.string().min(1, 'Mentor Profile ID is required'),
});

export const rejectMentorRequestSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});
