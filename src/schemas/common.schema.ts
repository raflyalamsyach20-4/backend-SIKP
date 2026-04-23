import { z } from 'zod';

export const emptyQuerySchema = z.object({}).passthrough();
export const emptyJsonSchema = z.object({}).passthrough();
export const emptyFormSchema = z.object({}).passthrough();
export const nonEmptyStringParamsSchema = z.object({}).catchall(z.string().min(1));

export const searchMahasiswaQuerySchema = z.object({
  q: z.string().min(1),
});
