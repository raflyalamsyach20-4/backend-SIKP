/**
 * Success messages
 */
export const SuccessMessages = {
  // Auth
  REGISTRATION_SUCCESS: 'Registration successful',
  LOGIN_SUCCESS: 'Login successful',
  USER_RETRIEVED: 'User retrieved',
  
  // Team
  TEAM_CREATED: 'Team created successfully',
  TEAM_UPDATED: 'Team updated successfully',
  TEAM_DELETED: 'Team deleted successfully',
  TEAM_FINALIZED: 'Team finalized successfully',
  MEMBER_INVITED: 'Member invited successfully',
  INVITATION_ACCEPTED: 'Invitation accepted successfully',
  INVITATION_REJECTED: 'Invitation rejected successfully',
  INVITATION_CANCELLED: 'Invitation cancelled successfully',
  MEMBER_REMOVED: 'Member removed successfully',
  LEFT_TEAM: 'Successfully left team',
  JOINED_TEAM: 'Successfully joined team',
  
  // Submission
  SUBMISSION_CREATED: 'Submission created successfully',
  SUBMISSION_UPDATED: 'Submission updated successfully',
  SUBMISSION_SUBMITTED: 'Submission submitted for review',
  SUBMISSION_APPROVED: 'Submission approved',
  SUBMISSION_REJECTED: 'Submission rejected',
  SUBMISSION_RESET: 'Submission reset to draft',
  DOCUMENT_UPLOADED: 'Document uploaded successfully',
  DOCUMENT_DELETED: 'Document deleted successfully',
  
  // Admin
  STATUS_UPDATED: 'Status updated successfully',
  LETTER_GENERATED: 'Letter generated successfully',
  
  // Template
  TEMPLATE_CREATED: 'Template created successfully',
  TEMPLATE_UPDATED: 'Template updated successfully',
  TEMPLATE_DELETED: 'Template deleted successfully',
  TEMPLATE_ACTIVATED: 'Template activated',
  TEMPLATE_DEACTIVATED: 'Template deactivated',
  
  // Response Letter
  RESPONSE_LETTER_SUBMITTED: 'Surat balasan berhasil dikirim',
  RESPONSE_LETTER_VERIFIED: 'Surat balasan berhasil diverifikasi',
  RESPONSE_LETTER_DELETED: 'Surat balasan berhasil dihapus',
} as const;

/**
 * Error messages
 */
export const ErrorMessages = {
  // Auth
  REGISTRATION_FAILED: 'Registration failed',
  LOGIN_FAILED: 'Login failed',
  INVALID_CREDENTIALS: 'Invalid email or password',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Access forbidden',
  TOKEN_EXPIRED: 'Token expired',
  TOKEN_INVALID: 'Invalid token',
  
  // Validation
  VALIDATION_FAILED: 'Validation failed',
  INVALID_INPUT: 'Invalid input data',
  MISSING_REQUIRED_FIELD: 'Missing required field',
  
  // User
  USER_NOT_FOUND: 'User not found',
  USER_ALREADY_EXISTS: 'User already exists',
  EMAIL_ALREADY_REGISTERED: 'Email already registered',
  NIM_ALREADY_REGISTERED: 'NIM already registered',
  NIP_ALREADY_REGISTERED: 'NIP already registered',
  
  // Team
  TEAM_NOT_FOUND: 'Team not found',
  TEAM_ALREADY_FINALIZED: 'Team already finalized',
  NOT_TEAM_LEADER: 'Only team leader can perform this action',
  ALREADY_IN_TEAM: 'User already in a team',
  INVITATION_NOT_FOUND: 'Invitation not found',
  INVALID_TEAM_CODE: 'Invalid team code',
  CANNOT_LEAVE_AS_LEADER: 'Leader cannot leave team, delete team instead',
  CANNOT_REMOVE_SELF: 'Cannot remove yourself from team',
  
  // Submission
  SUBMISSION_NOT_FOUND: 'Submission not found',
  SUBMISSION_NOT_DRAFT: 'Can only edit draft submissions',
  SUBMISSION_ALREADY_SUBMITTED: 'Submission already submitted',
  INVALID_SUBMISSION_STATUS: 'Invalid submission status',
  
  // Document
  DOCUMENT_NOT_FOUND: 'Document not found',
  INVALID_FILE_TYPE: 'Invalid file type',
  FILE_TOO_LARGE: 'File size exceeds maximum limit',
  UPLOAD_FAILED: 'File upload failed',
  
  // Template
  TEMPLATE_NOT_FOUND: 'Template not found',
  NO_ACTIVE_TEMPLATE: 'No active template available',
  
  // Response Letter
  RESPONSE_LETTER_NOT_FOUND: 'Surat balasan tidak ditemukan',
  RESPONSE_LETTER_ALREADY_VERIFIED: 'Surat balasan sudah diverifikasi',
  RESPONSE_LETTER_SUBMIT_FAILED: 'Gagal mengirim surat balasan',
  INVALID_RESPONSE_LETTER_STATUS: 'Status surat balasan tidak valid',
  
  // General
  INTERNAL_SERVER_ERROR: 'Internal server error',
  NOT_FOUND: 'Resource not found',
  BAD_REQUEST: 'Bad request',
  SEARCH_QUERY_TOO_SHORT: 'Search query must be at least 2 characters',
  SEARCH_QUERY_EMPTY: 'Search query cannot be empty',
} as const;

export type SuccessMessage = typeof SuccessMessages[keyof typeof SuccessMessages];
export type ErrorMessage = typeof ErrorMessages[keyof typeof ErrorMessages];
