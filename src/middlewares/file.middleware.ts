import { Context, Next } from 'hono';
import { createResponse } from '@/utils/helpers';

export interface FileValidationOptions {
  maxSizeMB: number;
  allowedMimeTypes: string[];
  fieldName: string;
}

/**
 * Middleware to validate file uploads before reaching the controller.
 * Checks for file presence, size limits, and allowed MIME types.
 */
export const validateFileUpload = (options: FileValidationOptions) => {
  return async (c: Context, next: Next) => {
    try {
      // We clone the request or parse it once. 
      // Hono's parseBody() can be called multiple times as it caches the result.
      const formData = await c.req.parseBody();
      const file = formData[options.fieldName];

      if (!file) {
        return c.json(createResponse(false, `Field '${options.fieldName}' is required`), 400);
      }

      if (!(file instanceof File)) {
        return c.json(createResponse(false, `Field '${options.fieldName}' must be a valid file`), 400);
      }

      // Check file size
      const maxSizeBytes = options.maxSizeMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        return c.json(
          createResponse(false, `File size exceeds the ${options.maxSizeMB}MB limit`),
          400
        );
      }

      // Check MIME type
      if (options.allowedMimeTypes.length > 0 && !options.allowedMimeTypes.includes(file.type)) {
        return c.json(
          createResponse(false, `Invalid file type. Allowed types: ${options.allowedMimeTypes.join(', ')}`),
          400
        );
      }

      await next();
    } catch (error) {
      console.error('[FileUploadMiddleware] Error:', error);
      return c.json(createResponse(false, 'Error validating file upload'), 400);
    }
  };
};
