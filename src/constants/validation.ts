/**
 * Validation constants
 */
export const ValidationRules = {
  PASSWORD_MIN_LENGTH: 6,
  SEARCH_QUERY_MIN_LENGTH: 2,
  TEAM_NAME_MIN_LENGTH: 3,
  TEAM_NAME_MAX_LENGTH: 100,
  TEAM_CODE_LENGTH: 6,
  NIM_MIN_LENGTH: 1,
  NIP_MIN_LENGTH: 1,
  EMAIL_MAX_LENGTH: 255,
  PHONE_MAX_LENGTH: 20,
} as const;

/**
 * File upload constants
 */
export const FileUpload = {
  MAX_FILE_SIZE_MB: 10,
  ALLOWED_DOCUMENT_TYPES: ['pdf', 'doc', 'docx'],
  ALLOWED_IMAGE_TYPES: ['jpg', 'jpeg', 'png'],
} as const;

/**
 * Pagination constants
 */
export const Pagination = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
} as const;
