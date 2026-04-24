import { Context } from 'hono';
import type { ApiResponse } from '@/types';

type ErrorLike = {
  message?: string;
  statusCode?: number;
};

type ErrorResponseStatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 500;

const isErrorLike = (value: unknown): value is ErrorLike => {
  return typeof value === 'object' && value !== null;
};

export const createResponse = <T>(
  success: boolean,
  message: string,
  data?: T
): ApiResponse<T> => {
  return {
    success,
    message,
    data,
  };
};

export const handleError = (c: Context, error: unknown, defaultMessage: string = 'Internal server error') => {
  console.error('Error:', error);

  const message = isErrorLike(error) && typeof error.message === 'string'
    ? error.message
    : defaultMessage;
  const statusCode = isErrorLike(error) && typeof error.statusCode === 'number'
    ? error.statusCode
    : 500;
  const safeStatusCode: ErrorResponseStatusCode =
    statusCode === 400 ||
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 404 ||
    statusCode === 409 ||
    statusCode === 422
      ? statusCode
      : 500;
  
  return c.json(createResponse(false, message), safeStatusCode);
};

export const createError = (message: string, statusCode: number = 500) => {
  const error = new Error(message);
  (error as any).statusCode = statusCode;
  return error;
};

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const generateTeamCode = (): string => {
  const prefix = 'TEAM';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export const validateFileType = (fileName: string, allowedTypes: string[]): boolean => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext ? allowedTypes.includes(ext) : false;
};

export const validateFileSize = (size: number, maxSizeMB: number): boolean => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return size <= maxSizeBytes;
};
