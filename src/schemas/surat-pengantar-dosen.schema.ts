import { z } from 'zod';

export const rejectRequestSchema = z.object({
  rejection_reason: z.string().min(1),
});
