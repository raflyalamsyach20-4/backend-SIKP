import { z } from 'zod';

// Create Template Schema
export const createTemplateSchema = z.object({
  name: z.string()
    .min(3, 'Nama template minimal 3 karakter')
    .max(255, 'Nama template maksimal 255 karakter'),
  type: z.string().default('standard'),
  description: z.string().optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// Update Template Schema
export const updateTemplateSchema = createTemplateSchema.partial().extend({
  file: z.instanceof(File).optional(),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

// Query Filter Schema
export const templateFilterSchema = z.object({
  type: z.string().optional(),
  search: z.string().optional(),
});

export type TemplateFilter = z.infer<typeof templateFilterSchema>;

/**
 * Validate template creation input
 */
export const validateTemplateInput = (data: unknown) => {
  try {
    return createTemplateSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
      };
    }
    throw error;
  }
};

/**
 * Validate template update input
 */
export const validateTemplateUpdate = (data: unknown) => {
  try {
    return updateTemplateSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
      };
    }
    throw error;
  }
};

/**
 * Validate template filters
 */
export const validateTemplateFilters = (data: unknown) => {
  try {
    return templateFilterSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
      };
    }
    throw error;
  }
};
