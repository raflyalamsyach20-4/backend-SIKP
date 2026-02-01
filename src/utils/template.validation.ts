import { z } from 'zod';

// Template Field Schema
export const templateFieldSchema = z.object({
  variable: z.string().min(1, 'Variable harus diisi'),
  label: z.string().min(1, 'Label harus diisi'),
  type: z.enum(['text', 'textarea', 'number', 'date', 'time', 'email', 'select'], {
    errorMap: () => ({ message: 'Tipe field tidak valid' }),
  }),
  required: z.boolean().default(true),
  placeholder: z.string().optional(),
  order: z.number().int().nonnegative('Order harus berupa angka positif'),
  options: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
    })
  ).optional(),
});

export type TemplateFieldInput = z.infer<typeof templateFieldSchema>;

// Create Template Schema
export const createTemplateSchema = z.object({
  name: z.string()
    .min(3, 'Nama template minimal 3 karakter')
    .max(255, 'Nama template maksimal 255 karakter'),
  type: z.enum(['Template Only', 'Generate & Template'], {
    errorMap: () => ({ message: 'Tipe template harus "Template Only" atau "Generate & Template"' }),
  }),
  description: z.string().optional(),
  fields: z.array(templateFieldSchema).optional(),
  isActive: z.boolean().default(true),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// Update Template Schema
export const updateTemplateSchema = createTemplateSchema.partial().extend({
  file: z.instanceof(File).optional(),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

// Query Filter Schema
export const templateFilterSchema = z.object({
  type: z.enum(['Template Only', 'Generate & Template']).optional(),
  isActive: z.boolean().optional(),
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
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
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
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
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
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      };
    }
    throw error;
  }
};
