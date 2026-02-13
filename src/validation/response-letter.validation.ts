import { z } from 'zod';

/**
 * Submit Response Letter Schema
 */
export const submitResponseLetterSchema = z.object({
  submissionId: z.string().min(1, 'Submission ID is required'),
  file: z.any().refine((file) => file instanceof File || (file && typeof file.arrayBuffer === 'function'), {
    message: 'Valid file is required',
  }),
});

export type SubmitResponseLetterInput = z.infer<typeof submitResponseLetterSchema>;

/**
 * Verify Response Letter Schema
 */
export const verifyResponseLetterSchema = z.object({
  letterStatus: z.enum(['approved', 'rejected']),
});

export type VerifyResponseLetterInput = z.infer<typeof verifyResponseLetterSchema>;

/**
 * Response Letter ID Parameter Schema
 */
export const responseLetterIdParamSchema = z.object({
  id: z.string().min(1, 'Response Letter ID is required'),
});

export type ResponseLetterIdParam = z.infer<typeof responseLetterIdParamSchema>;

/**
 * Get Response Letters Query Schema
 */
export const getResponseLettersQuerySchema = z.object({
  letterStatus: z.enum(['approved', 'rejected']).optional(),
  verified: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['submittedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(50),
});

export type GetResponseLettersQuery = z.infer<typeof getResponseLettersQuerySchema>;
