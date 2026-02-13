/**
 * Submission statuses
 */
export const SubmissionStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type SubmissionStatusType = typeof SubmissionStatus[keyof typeof SubmissionStatus];

/**
 * Team member statuses
 */
export const MemberStatus = {
  INVITED: 'INVITED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  REMOVED: 'REMOVED',
  LEFT: 'LEFT',
} as const;

export type MemberStatusType = typeof MemberStatus[keyof typeof MemberStatus];

/**
 * Team roles
 */
export const TeamRole = {
  LEADER: 'LEADER',
  MEMBER: 'MEMBER',
} as const;

export type TeamRoleType = typeof TeamRole[keyof typeof TeamRole];

/**
 * Document review statuses
 */
export const DocumentReviewStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
} as const;

export type DocumentReviewStatusType = typeof DocumentReviewStatus[keyof typeof DocumentReviewStatus];

/**
 * Response letter statuses (from company)
 */
export const ResponseLetterStatus = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ResponseLetterStatusType = typeof ResponseLetterStatus[keyof typeof ResponseLetterStatus];

/**
 * Response letter tracking statuses
 */
export const ResponseLetterTrackingStatus = {
  PENDING: 'pending',
  SUBMITTED: 'submitted',
  VERIFIED: 'verified',
} as const;

export type ResponseLetterTrackingStatusType = typeof ResponseLetterTrackingStatus[keyof typeof ResponseLetterTrackingStatus];
