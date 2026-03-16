import { pgTable, text, timestamp, boolean, pgEnum, varchar, integer, uniqueIndex, bigint, json, index, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const roleEnum = pgEnum('role', ['MAHASISWA', 'ADMIN', 'DOSEN', 'KAPRODI', 'WAKIL_DEKAN', 'PEMBIMBING_LAPANGAN']);
export const teamStatusEnum = pgEnum('team_status', ['PENDING', 'FIXED']);
export const invitationStatusEnum = pgEnum('invitation_status', ['PENDING', 'ACCEPTED', 'REJECTED']);
export const submissionStatusEnum = pgEnum('submission_status', ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED']);
export const documentTypeEnum = pgEnum('document_type', ['PROPOSAL_KETUA', 'SURAT_KESEDIAAN', 'FORM_PERMOHONAN', 'KRS_SEMESTER_4', 'DAFTAR_KUMPULAN_NILAI', 'BUKTI_PEMBAYARAN_UKT', 'SURAT_PENGANTAR']);
export const documentStatusEnum = pgEnum('document_status', ['PENDING', 'APPROVED', 'REJECTED']);
export const letterStatusEnum = pgEnum('letter_status', ['approved', 'rejected']);
export const responseLetterStatusEnum = pgEnum('response_letter_status', ['pending', 'submitted', 'verified']);
export const suratKesediaanStatusEnum = pgEnum('surat_kesediaan_status', ['MENUNGGU', 'DISETUJUI', 'DITOLAK']);
export const suratPermohonanStatusEnum = pgEnum('surat_permohonan_status', ['MENUNGGU', 'DISETUJUI', 'DITOLAK']);

// Users Table (Base table untuk semua user)
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  nama: varchar('nama', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: text('password').notNull(),
  role: roleEnum('role').notNull().default('MAHASISWA'),
  phone: varchar('phone', { length: 20 }),
  isActive: boolean('is_active').notNull().default(true),
});

// Mahasiswa Table (Extended data untuk mahasiswa)
export const mahasiswa = pgTable('mahasiswa', {
  nim: varchar('nim', { length: 20 }).primaryKey(),
  id: text('id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  fakultas: varchar('fakultas', { length: 100 }),
  prodi: varchar('prodi', { length: 100 }),
  semester: integer('semester'),
  jumlahSksSelesai: integer('jumlah_sks_selesai'),
  angkatan: varchar('angkatan', { length: 10 }),
  esignatureUrl: text('esignature_url'),
  esignatureKey: varchar('esignature_key', { length: 255 }),
  esignatureUploadedAt: timestamp('esignature_uploaded_at'),
});

// Admin Table
export const admin = pgTable('admin', {
  id: text('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  nip: varchar('nip', { length: 30 }).notNull().unique(),
  fakultas: varchar('fakultas', { length: 100 }),
  prodi: varchar('prodi', { length: 100 }),
});

// Dosen Table
export const dosen = pgTable('dosen', {
  id: text('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  nip: varchar('nip', { length: 30 }).notNull().unique(),
  jabatan: varchar('jabatan', { length: 100 }),
  fakultas: varchar('fakultas', { length: 100 }),
  prodi: varchar('prodi', { length: 100 }),
  esignatureUrl: text('esignature_url'),
  esignatureKey: varchar('esignature_key', { length: 255 }),
  esignatureUploadedAt: timestamp('esignature_uploaded_at'),
});

// Pembimbing Lapangan Table
export const pembimbingLapangan = pgTable('pembimbing_lapangan', {
  id: text('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  companyName: varchar('company_name', { length: 255 }),
  position: varchar('position', { length: 100 }),
  companyAddress: text('company_address'),
});

// Teams Table
export const teams = pgTable('teams', {
  id: text('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  leaderId: text('leader_id').notNull().references(() => users.id),
  status: teamStatusEnum('status').notNull().default('PENDING'),
});

// Team Members Table (includes invitations)
export const teamMembers = pgTable('team_members', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').notNull().default('ANGGOTA'), // KETUA or ANGGOTA
  invitationStatus: invitationStatusEnum('invitation_status').notNull().default('PENDING'),
  invitedAt: timestamp('invited_at').defaultNow().notNull(),
  respondedAt: timestamp('responded_at'),
  invitedBy: text('invited_by').references(() => users.id), // User who sent the invitation
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
  approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
  documentReviews: json('document_reviews').default('{}'), // ✅ NEW: Stores individual document review status
  statusHistory: json('status_history').notNull().default('[]'),
  
  // Response letter tracking
  responseLetterStatus: responseLetterStatusEnum('response_letter_status').default('pending'),

  // Soft-archive support: when a team resets ("Mulai Ulang"), the submission is
  // archived instead of deleted so admin/dosen history is preserved.
  // NULL = active submission; non-null = archived (superseded by a later attempt).
  archivedAt: timestamp('archived_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  // Unique constraint is enforced at application layer (only one non-archived
  // submission per team). DB-level unique index was dropped in migration 0036.
  return {};
});

// Submission Documents Table
export const submissionDocuments = pgTable('submission_documents', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  documentType: documentTypeEnum('document_type').notNull(),
  memberUserId: text('member_user_id').notNull().references(() => users.id),
  uploadedByUserId: text('uploaded_by_user_id').notNull().references(() => users.id),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  fileUrl: text('file_url').notNull(),
  // ✅ NEW: Document status tracking
  status: documentStatusEnum('status').notNull().default('PENDING'),
  statusUpdatedAt: timestamp('status_updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    uqDocPerMember: uniqueIndex('uq_document_per_member').on(table.submissionId, table.documentType, table.memberUserId),
    // ✅ NEW: Indexes for document status queries
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
  fileType: varchar('file_type', { length: 10 }).notNull(), // PDF or DOCX
  generatedBy: text('generated_by').notNull().references(() => users.id),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Templates Table
export const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'Template Only' atau 'Generate & Template'
  description: text('description'),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: bigint('file_size', { mode: 'number' }).notNull(),
  fileType: varchar('file_type', { length: 100 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  fields: json('fields'), // Array of TemplateField objects
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
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
  
  // File information
  originalName: varchar('original_name', { length: 255 }),
  fileName: varchar('file_name', { length: 255 }),
  fileType: varchar('file_type', { length: 100 }),
  fileSize: bigint('file_size', { mode: 'number' }),
  fileUrl: text('file_url'),
  memberUserId: text('member_user_id').references(() => users.id, { onDelete: 'set null' }),
  
  // Letter status from company
  letterStatus: letterStatusEnum('letter_status').notNull(),

  // Snapshot fields for history
  studentName: varchar('student_name', { length: 255 }),
  studentNim: varchar('student_nim', { length: 50 }),
  companyName: varchar('company_name', { length: 255 }),
  supervisorName: varchar('supervisor_name', { length: 255 }),
  memberCount: integer('member_count'),
  roleLabel: varchar('role_label', { length: 50 }),
  membersSnapshot: json('members_snapshot'),
  
  // Submission tracking
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  
  // Admin verification
  verified: boolean('verified').notNull().default(false),
  verifiedAt: timestamp('verified_at'),
  verifiedByAdminId: text('verified_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
}, (table) => {
  return {
    idxSubmissionId: index('idx_response_letters_submission_id').on(table.submissionId),
    idxVerified: index('idx_response_letters_verified').on(table.verified),
  };
});

// Surat Kesediaan Requests Table
export const suratKesediaanRequests = pgTable('surat_kesediaan_requests', {
  id: text('id').primaryKey(),
  memberUserId: text('member_user_id').notNull().references(() => users.id),
  dosenUserId: text('dosen_user_id').notNull().references(() => users.id),
  status: suratKesediaanStatusEnum('status').notNull().default('MENUNGGU'),
  approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at'),
  signedFileUrl: text('signed_file_url'),
  signedFileKey: text('signed_file_key'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    uqRequest: uniqueIndex('uq_surat_kesediaan_request').on(table.memberUserId, table.dosenUserId),
    idxDosenStatus: index('idx_surat_kesediaan_dosen_status').on(table.dosenUserId, table.status),
    idxMemberStatus: index('idx_surat_kesediaan_member_status').on(table.memberUserId, table.status),
    idxCreatedAt: index('idx_surat_kesediaan_created_at').on(table.createdAt),
  };
});

// Surat Permohonan Requests Table
export const suratPermohonanRequests = pgTable('surat_permohonan_requests', {
  id: text('id').primaryKey(),
  memberUserId: text('member_user_id').notNull().references(() => users.id),
  dosenUserId: text('dosen_user_id').notNull().references(() => users.id),
  submissionId: text('submission_id').notNull().references(() => submissions.id),
  status: suratPermohonanStatusEnum('status').notNull().default('MENUNGGU'),
  mahasiswaEsignatureUrl: text('mahasiswa_esignature_url'),
  mahasiswaEsignatureSnapshotAt: timestamp('mahasiswa_esignature_snapshot_at'),
  signedFileUrl: text('signed_file_url'),
  signedFileKey: text('signed_file_key'),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  approvedAt: timestamp('approved_at'),
  approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    idxDosenStatusRequestedAt: index('idx_permohonan_dosen').on(table.dosenUserId, table.status, table.requestedAt),
    idxRequestedAt: index('idx_surat_permohonan_requested_at').on(table.requestedAt),
    idxMemberDosenStatus: index('idx_surat_permohonan_member_dosen_status').on(table.memberUserId, table.dosenUserId, table.status),
  };
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  mahasiswaProfile: one(mahasiswa),
  adminProfile: one(admin),
  dosenProfile: one(dosen),
  pembimbingLapanganProfile: one(pembimbingLapangan),
  teamsLed: many(teams),
  teamMemberships: many(teamMembers),
  approvedSubmissions: many(submissions),
  uploadedDocuments: many(submissionDocuments),
  generatedLetters: many(generatedLetters),
  createdTemplates: many(templates),
  updatedTemplates: many(templates),
  suratKesediaanRequestsAsMembers: many(suratKesediaanRequests, { relationName: 'memberUser' }),
  suratKesediaanRequestsAsDosen: many(suratKesediaanRequests, { relationName: 'dosenUser' }),
  suratKesediaanRequestsApprovedBy: many(suratKesediaanRequests, { relationName: 'approver' }),
  suratPermohonanRequestsAsMembers: many(suratPermohonanRequests, { relationName: 'permohonanMemberUser' }),
  suratPermohonanRequestsAsDosen: many(suratPermohonanRequests, { relationName: 'permohonanDosenUser' }),
  suratPermohonanRequestsApprovedBy: many(suratPermohonanRequests, { relationName: 'permohonanApprover' }),
}));

export const mahasiswaRelations = relations(mahasiswa, ({ one }) => ({
  user: one(users, {
    fields: [mahasiswa.id],
    references: [users.id],
  }),
}));

export const adminRelations = relations(admin, ({ one }) => ({
  user: one(users, {
    fields: [admin.id],
    references: [users.id],
  }),
}));

export const dosenRelations = relations(dosen, ({ one }) => ({
  user: one(users, {
    fields: [dosen.id],
    references: [users.id],
  }),
}));

export const pembimbingLapanganRelations = relations(pembimbingLapangan, ({ one }) => ({
  user: one(users, {
    fields: [pembimbingLapangan.id],
    references: [users.id],
  }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  leader: one(users, {
    fields: [teams.leaderId],
    references: [users.id],
  }),
  members: many(teamMembers),
  submissions: many(submissions),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
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
  memberUser: one(users, {
    fields: [responseLetters.memberUserId],
    references: [users.id],
  }),
  verifiedBy: one(users, {
    fields: [responseLetters.verifiedByAdminId],
    references: [users.id],
  }),
}));

export const submissionDocumentsRelations = relations(submissionDocuments, ({ one }) => ({
  submission: one(submissions, {
    fields: [submissionDocuments.submissionId],
    references: [submissions.id],
  }),
  member: one(users, {
    fields: [submissionDocuments.memberUserId],
    references: [users.id],
  }),
  uploader: one(users, {
    fields: [submissionDocuments.uploadedByUserId],
    references: [users.id],
  }),
}));

export const generatedLettersRelations = relations(generatedLetters, ({ one }) => ({
  submission: one(submissions, {
    fields: [generatedLetters.submissionId],
    references: [submissions.id],
  }),
  generator: one(users, {
    fields: [generatedLetters.generatedBy],
    references: [users.id],
  }),
}));
export const templatesRelations = relations(templates, ({ one }) => ({
  creator: one(users, {
    fields: [templates.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [templates.updatedBy],
    references: [users.id],
  }),
}));

export const suratKesediaanRequestsRelations = relations(suratKesediaanRequests, ({ one }) => ({
  memberUser: one(users, {
    fields: [suratKesediaanRequests.memberUserId],
    references: [users.id],
    relationName: 'memberUser',
  }),
  dosenUser: one(users, {
    fields: [suratKesediaanRequests.dosenUserId],
    references: [users.id],
    relationName: 'dosenUser',
  }),
  approver: one(users, {
    fields: [suratKesediaanRequests.approvedBy],
    references: [users.id],
    relationName: 'approver',
  }),
}));

export const suratPermohonanRequestsRelations = relations(suratPermohonanRequests, ({ one }) => ({
  memberUser: one(users, {
    fields: [suratPermohonanRequests.memberUserId],
    references: [users.id],
    relationName: 'permohonanMemberUser',
  }),
  dosenUser: one(users, {
    fields: [suratPermohonanRequests.dosenUserId],
    references: [users.id],
    relationName: 'permohonanDosenUser',
  }),
  submission: one(submissions, {
    fields: [suratPermohonanRequests.submissionId],
    references: [submissions.id],
  }),
  approver: one(users, {
    fields: [suratPermohonanRequests.approvedBy],
    references: [users.id],
    relationName: 'permohonanApprover',
  }),
}));