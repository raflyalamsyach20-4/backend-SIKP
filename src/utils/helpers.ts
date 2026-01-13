import { Context } from 'hono';
import type { ApiResponse } from '@/types';

export const createResponse = <T = any>(
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

export const handleError = (c: Context, error: any, defaultMessage: string = 'Internal server error') => {
  console.error('Error:', error);
  
  const message = error.message || defaultMessage;
  const statusCode = error.statusCode || 500;
  
  return c.json(createResponse(false, message), statusCode);
};

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
