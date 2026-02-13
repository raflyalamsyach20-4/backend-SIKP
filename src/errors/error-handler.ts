import { Context } from 'hono';
import { ZodError } from 'zod';
import { AppError, ValidationError } from './app-errors';

/**
 * Format Zod validation errors
 */
const formatZodError = (error: ZodError) => {
  return error.errors.map((err) => ({
    path: err.path.join('.'),
    message: err.message,
  }));
};

/**
 * Global error handler middleware
 */
export const errorHandler = (error: Error, c: Context): Response => {
  console.error('Error:', error);

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const formattedErrors = formatZodError(error);
    return c.json(
      {
        success: false,
        message: 'Validation failed',
        errors: formattedErrors,
      },
      422
    ) as Response;
  }

  // Handle custom application errors
  if (error instanceof AppError) {
    const response: any = {
      success: false,
      message: error.message,
    };

    // Include errors field for ValidationError
    if (error instanceof ValidationError && error.errors) {
      response.errors = error.errors;
    }

    return c.json(response, error.statusCode) as Response;
  }

  // Handle unknown errors
  return c.json(
    {
      success: false,
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message,
    },
    500
  ) as Response;
};
