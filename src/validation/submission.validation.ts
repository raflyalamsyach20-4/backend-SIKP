import { z } from 'zod';
import { SubmissionStatus } from '@/constants';

/**
 * Create Submission Schema
 */
export const createSubmissionSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
  judulKP: z.string().min(1, 'Title is required'),
  deskripsi: z.string().optional(),
  tempatKP: z.string().optional(),
  alamatTempatKP: z.string().optional(),
  dosenPembimbingId: z.string().optional(),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

/**
 * Update Submission Schema
 */
export const updateSubmissionSchema = z.object({
  judulKP: z.string().min(1).optional(),
  deskripsi: z.string().optional(),
  tempatKP: z.string().optional(),
  alamatTempatKP: z.string().optional(),
  dosenPembimbingId: z.string().optional(),
  pembimbingLapanganId: z.string().optional(),
});

export type UpdateSubmissionInput = z.infer<typeof updateSubmissionSchema>;

/**
 * Submit for Review Schema
 */
export const submitForReviewSchema = z.object({
  // Optionally include last-minute updates
  judulKP: z.string().optional(),
  deskripsi: z.string().optional(),
  tempatKP: z.string().optional(),
  alamatTempatKP: z.string().optional(),
});

export type SubmitForReviewInput = z.infer<typeof submitForReviewSchema>;

/**
 * Update Submission Status Schema (Admin)
 */
export const updateSubmissionStatusSchema = z.object({
  status: z.enum([
    SubmissionStatus.APPROVED,
    SubmissionStatus.REJECTED,
    SubmissionStatus.PENDING,
  ]),
  notes: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export type UpdateSubmissionStatusInput = z.infer<typeof updateSubmissionStatusSchema>;

/**
 * Approve/Reject Submission Schema
 */
export const approveRejectSubmissionSchema = z.object({
  notes: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export type ApproveRejectSubmissionInput = z.infer<typeof approveRejectSubmissionSchema>;

/**
 * Submission ID Parameter Schema
 */
export const submissionIdParamSchema = z.object({
  submissionId: z.string().min(1, 'Submission ID is required'),
});

export type SubmissionIdParam = z.infer<typeof submissionIdParamSchema>;

/**
 * Submission Status Parameter Schema
 */
export const submissionStatusParamSchema = z.object({
  status: z.enum([
    SubmissionStatus.DRAFT,
    SubmissionStatus.PENDING,
    SubmissionStatus.APPROVED,
    SubmissionStatus.REJECTED,
  ]),
});

export type SubmissionStatusParam = z.infer<typeof submissionStatusParamSchema>;
