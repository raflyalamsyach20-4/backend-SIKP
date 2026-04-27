import { pgTable, text, timestamp, boolean, pgEnum, varchar, integer, uniqueIndex, bigint, json, index, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const teamStatusEnum = pgEnum('team_status', ['PENDING', 'FIXED']);
export const invitationStatusEnum = pgEnum('invitation_status', ['PENDING', 'ACCEPTED', 'REJECTED']);
export const submissionStatusEnum = pgEnum('submission_status', ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED']);
export const documentTypeEnum = pgEnum('document_type', ['PROPOSAL_KETUA', 'SURAT_KESEDIAAN', 'FORM_PERMOHONAN', 'KRS_SEMESTER_4', 'DAFTAR_KUMPULAN_NILAI', 'BUKTI_PEMBAYARAN_UKT', 'SURAT_PENGANTAR']);
export const documentStatusEnum = pgEnum('document_status', ['PENDING', 'APPROVED', 'REJECTED']);
export const letterStatusEnum = pgEnum('letter_status', ['approved', 'rejected']);
export const responseLetterStatusEnum = pgEnum('response_letter_status', ['pending', 'submitted', 'verified']);
export const suratKesediaanStatusEnum = pgEnum('surat_kesediaan_status', ['MENUNGGU', 'DISETUJUI', 'DITOLAK']);
export const suratPermohonanStatusEnum = pgEnum('surat_permohonan_status', ['MENUNGGU', 'DISETUJUI', 'DITOLAK']);
export const submissionVerificationStatusEnum = pgEnum('submission_verification_status', ['PENDING', 'APPROVED', 'REJECTED']);
export const workflowStageEnum = pgEnum('workflow_stage', ['DRAFT', 'PENDING_ADMIN_REVIEW', 'PENDING_DOSEN_VERIFICATION', 'COMPLETED', 'REJECTED_ADMIN', 'REJECTED_DOSEN']);

// Minimal auth session store for SSO cutover
export const authSessions = pgTable('auth_sessions', {
  sessionId: text('session_id').primaryKey(),
  authUserId: varchar('auth_user_id', { length: 255 }).notNull(),
  activeIdentity: varchar('active_identity', { length: 100 }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    idxAuthSessionsAuthUserId: index('idx_auth_sessions_auth_user_id').on(table.authUserId),
    idxAuthSessionsExpiresAt: index('idx_auth_sessions_expires_at').on(table.expiresAt),
  };
});

// Teams Table
export const teams = pgTable('teams', {
  id: text('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  leaderMahasiswaId: text('leader_mahasiswa_id').notNull(),
  dosenKpId: text('dosen_kp_id'),
  status: teamStatusEnum('status').notNull().default('PENDING'),
});

// Team Members Table (includes invitations)
export const teamMembers = pgTable('team_members', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  mahasiswaId: text('mahasiswa_id').notNull(),
  role: text('role').notNull().default('ANGGOTA'), // KETUA or ANGGOTA
  invitationStatus: invitationStatusEnum('invitation_status').notNull().default('PENDING'),
  invitedAt: timestamp('invited_at').defaultNow().notNull(),
  respondedAt: timestamp('responded_at'),
  invitedByMahasiswaId: text('invited_by_mahasiswa_id'),
});

// Submissions Table
export const submissions = pgTable('submissions', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  letterPurpose: varchar('letter_purpose', { length: 255 }).notNull(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  companyAddress: text('company_address').notNull(),
  companyPhone: varchar('company_phone', { length: 50 }),
  companyBusinessType: varchar('company_business_type', { length: 255 }),
  division: varchar('division', { length: 255 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: submissionStatusEnum('status').notNull().default('DRAFT'),
  rejectionReason: text('rejection_reason'),
  submittedAt: timestamp('submitted_at'),
  approvedAt: timestamp('approved_at'),
  approvedByAdminId: text('approved_by_admin_id'),
  adminVerificationStatus: submissionVerificationStatusEnum('admin_verification_status').notNull().default('PENDING'),
  adminVerifiedAt: timestamp('admin_verified_at'),
  adminVerifiedByAdminId: text('admin_verified_by_admin_id'),
  adminRejectionReason: text('admin_rejection_reason'),
  dosenVerificationStatus: submissionVerificationStatusEnum('dosen_verification_status').notNull().default('PENDING'),
  dosenVerifiedAt: timestamp('dosen_verified_at'),
  dosenVerifiedByDosenId: text('dosen_verified_by_dosen_id'),
  dosenRejectionReason: text('dosen_rejection_reason'),
  letterNumber: varchar('letter_number', { length: 100 }),
  workflowStage: workflowStageEnum('workflow_stage').notNull().default('DRAFT'),
  finalSignedFileUrl: text('final_signed_file_url'),
  documentReviews: json('document_reviews').default('{}'),
  statusHistory: json('status_history').notNull().default('[]'),
  responseLetterStatus: responseLetterStatusEnum('response_letter_status').default('pending'),
  archivedAt: timestamp('archived_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    idxWorkflowStage: index('idx_submissions_workflow_stage').on(table.workflowStage),
    idxAdminVerificationStatus: index('idx_submissions_admin_status').on(table.adminVerificationStatus),
    idxDosenVerificationStatus: index('idx_submissions_dosen_status').on(table.dosenVerificationStatus),
    idxDosenQueue: index('idx_submissions_dosen_queue').on(table.workflowStage, table.dosenVerifiedByDosenId, table.createdAt),
    uqLetterNumber: uniqueIndex('submissions_letter_number_unique').on(table.letterNumber),
  };
});

// Submission Documents Table
export const submissionDocuments = pgTable('submission_documents', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  documentType: documentTypeEnum('document_type').notNull(),
  memberMahasiswaId: text('member_mahasiswa_id').notNull(),
  uploadedByMahasiswaId: text('uploaded_by_mahasiswa_id').notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  fileUrl: text('file_url').notNull(),
  status: documentStatusEnum('status').notNull().default('PENDING'),
  statusUpdatedAt: timestamp('status_updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    uqDocPerMember: uniqueIndex('uq_document_per_member').on(table.submissionId, table.documentType, table.memberMahasiswaId),
    idxSubmissionStatus: index('idx_submission_status').on(table.submissionId, table.status),
    idxStatusUpdated: index('idx_status_updated').on(table.statusUpdatedAt),
  };
});

// Generated Letters Table
export const generatedLetters = pgTable('generated_letters', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  letterNumber: varchar('letter_number', { length: 100 }).notNull().unique(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileUrl: text('file_url').notNull(),
  fileType: varchar('file_type', { length: 10 }).notNull(),
  generatedByAdminId: text('generated_by_admin_id').notNull(),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Templates Table
export const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  description: text('description'),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: bigint('file_size', { mode: 'number' }).notNull(),
  fileType: varchar('file_type', { length: 100 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  fields: json('fields'),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdByAdminId: text('created_by_admin_id').notNull(),
  updatedByAdminId: text('updated_by_admin_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    idxType: index('idx_templates_type').on(table.type),
    idxIsActive: index('idx_templates_is_active').on(table.isActive),
    idxCreatedAt: index('idx_templates_created_at').on(table.createdAt),
  };
});

// Response Letters Table
export const responseLetters = pgTable('response_letters', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').references(() => submissions.id, { onDelete: 'set null' }),
  originalName: varchar('original_name', { length: 255 }),
  fileName: varchar('file_name', { length: 255 }),
  fileType: varchar('file_type', { length: 100 }),
  fileSize: bigint('file_size', { mode: 'number' }),
  fileUrl: text('file_url'),
  memberMahasiswaId: text('member_mahasiswa_id'),
  letterStatus: letterStatusEnum('letter_status').notNull(),
  studentName: varchar('student_name', { length: 255 }),
  studentNim: varchar('student_nim', { length: 50 }),
  companyName: varchar('company_name', { length: 255 }),
  supervisorName: varchar('supervisor_name', { length: 255 }),
  memberCount: integer('member_count'),
  roleLabel: varchar('role_label', { length: 50 }),
  membersSnapshot: json('members_snapshot'),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  verified: boolean('verified').notNull().default(false),
  verifiedAt: timestamp('verified_at'),
  verifiedByAdminId: text('verified_by_admin_id'),
}, (table) => {
  return {
    idxSubmissionId: index('idx_response_letters_submission_id').on(table.submissionId),
    idxVerified: index('idx_response_letters_verified').on(table.verified),
  };
});

// Surat Kesediaan Requests Table
export const suratKesediaanRequests = pgTable('surat_kesediaan_requests', {
  id: text('id').primaryKey(),
  memberMahasiswaId: text('member_mahasiswa_id').notNull(),
  dosenId: text('dosen_id').notNull(),
  status: suratKesediaanStatusEnum('status').notNull().default('MENUNGGU'),
  approvedByDosenId: text('approved_by_dosen_id'),
  approvedAt: timestamp('approved_at'),
  signedFileUrl: text('signed_file_url'),
  signedFileKey: text('signed_file_key'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    uqRequest: uniqueIndex('uq_surat_kesediaan_request').on(table.memberMahasiswaId, table.dosenId),
    idxDosenStatus: index('idx_surat_kesediaan_dosen_status').on(table.dosenId, table.status),
    idxMemberStatus: index('idx_surat_kesediaan_member_status').on(table.memberMahasiswaId, table.status),
    idxCreatedAt: index('idx_surat_kesediaan_created_at').on(table.createdAt),
  };
});

// Surat Permohonan Requests Table
export const suratPermohonanRequests = pgTable('surat_permohonan_requests', {
  id: text('id').primaryKey(),
  memberMahasiswaId: text('member_mahasiswa_id').notNull(),
  dosenId: text('dosen_id').notNull(),
  submissionId: text('submission_id').notNull().references(() => submissions.id),
  status: suratPermohonanStatusEnum('status').notNull().default('MENUNGGU'),
  mahasiswaEsignatureUrl: text('mahasiswa_esignature_url'),
  mahasiswaEsignatureSnapshotAt: timestamp('mahasiswa_esignature_snapshot_at'),
  signedFileUrl: text('signed_file_url'),
  signedFileKey: text('signed_file_key'),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  approvedAt: timestamp('approved_at'),
  approvedByDosenId: text('approved_by_dosen_id'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    idxDosenStatusRequestedAt: index('idx_permohonan_dosen').on(table.dosenId, table.status, table.requestedAt),
    idxRequestedAt: index('idx_surat_permohonan_requested_at').on(table.requestedAt),
    idxMemberDosenStatus: index('idx_surat_permohonan_member_dosen_status').on(table.memberMahasiswaId, table.dosenId, table.status),
  };
});

// Relations
export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  submissions: many(submissions),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  team: one(teams, {
    fields: [submissions.teamId],
    references: [teams.id],
  }),
  documents: many(submissionDocuments),
  letters: many(generatedLetters),
  responseLetters: many(responseLetters),
}));

export const responseLettersRelations = relations(responseLetters, ({ one }) => ({
  submission: one(submissions, {
    fields: [responseLetters.submissionId],
    references: [submissions.id],
  }),
}));

export const submissionDocumentsRelations = relations(submissionDocuments, ({ one }) => ({
  submission: one(submissions, {
    fields: [submissionDocuments.submissionId],
    references: [submissions.id],
  }),
}));

export const generatedLettersRelations = relations(generatedLetters, ({ one }) => ({
  submission: one(submissions, {
    fields: [generatedLetters.submissionId],
    references: [submissions.id],
  }),
}));

export const suratPermohonanRequestsRelations = relations(suratPermohonanRequests, ({ one }) => ({
  submission: one(submissions, {
    fields: [suratPermohonanRequests.submissionId],
    references: [submissions.id],
  }),
}));
