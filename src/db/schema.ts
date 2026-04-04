import { pgTable, text, timestamp, boolean, pgEnum, varchar, integer, uniqueIndex, bigint, json, index, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const roleEnum = pgEnum('role', ['MAHASISWA', 'ADMIN', 'DOSEN', 'KAPRODI', 'WAKIL_DEKAN', 'PEMBIMBING_LAPANGAN']);
export const teamStatusEnum = pgEnum('team_status', ['PENDING', 'FIXED']);
export const invitationStatusEnum = pgEnum('invitation_status', ['PENDING', 'ACCEPTED', 'REJECTED']);
export const submissionStatusEnum = pgEnum('submission_status', ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED']);
export const documentTypeEnum = pgEnum('document_type', ['PROPOSAL_KETUA', 'SURAT_KESEDIAAN', 'FORM_PERMOHONAN', 'KRS_SEMESTER_4', 'DAFTAR_KUMPULAN_NILAI', 'BUKTI_PEMBAYARAN_UKT', 'SURAT_PENGANTAR']);

// New Enums for Internship Phase
export const internshipStatusEnum = pgEnum('internship_status', ['PENDING', 'AKTIF', 'SELESAI', 'DIBATALKAN']);
export const logbookStatusEnum = pgEnum('logbook_status', ['PENDING', 'APPROVED', 'REJECTED']);
export const reportStatusEnum = pgEnum('report_status', ['DRAFT', 'SUBMITTED', 'APPROVED', 'NEEDS_REVISION', 'REJECTED']);
export const titleStatusEnum = pgEnum('title_status', ['PENDING', 'APPROVED', 'REJECTED']);
export const approvalStatusEnum = pgEnum('approval_status', ['PENDING', 'APPROVED', 'REJECTED']);

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
  angkatan: varchar('angkatan', { length: 10 }),
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
});

// Pembimbing Lapangan Table
export const pembimbingLapangan = pgTable('pembimbing_lapangan', {
  id: text('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  companyName: varchar('company_name', { length: 255 }),
  position: varchar('position', { length: 100 }),
  companyAddress: text('company_address'),
  signature: text('signature'), // Base64 signature image
  signatureSetAt: timestamp('signature_set_at'),
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
  division: varchar('division', { length: 255 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: submissionStatusEnum('status').notNull().default('DRAFT'),
  rejectionReason: text('rejection_reason'),
  submittedAt: timestamp('submitted_at'),
  approvedAt: timestamp('approved_at'),
  approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
  statusHistory: json('status_history').notNull().default('[]'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    uqDocPerMember: uniqueIndex('uq_document_per_member').on(table.submissionId, table.documentType, table.memberUserId),
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

// Internships Table (Auto-created setelah submission approved)
export const internships = pgTable('internships', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  mahasiswaId: varchar('mahasiswa_id', { length: 20 }).notNull().references(() => mahasiswa.nim, { onDelete: 'cascade' }),
  teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
  pembimbingLapanganId: text('pembimbing_lapangan_id').references(() => pembimbingLapangan.id, { onDelete: 'set null' }),
  dosenPembimbingId: text('dosen_pembimbing_id').references(() => dosen.id, { onDelete: 'set null' }),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  division: varchar('division', { length: 255 }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: internshipStatusEnum('status').notNull().default('AKTIF'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Logbooks Table (Logbook harian mahasiswa)
export const logbooks = pgTable('logbooks', {
  id: text('id').primaryKey(),
  internshipId: text('internship_id').notNull().references(() => internships.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  activity: varchar('activity', { length: 255 }).notNull(),
  description: text('description').notNull(),
  hours: integer('hours'),
  status: logbookStatusEnum('status').notNull().default('PENDING'),
  rejectionReason: text('rejection_reason'),
  verifiedBy: text('verified_by').references(() => pembimbingLapangan.id, { onDelete: 'set null' }),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Assessments Table (Penilaian dari Pembimbing Lapangan - 30%)
export const assessments = pgTable('assessments', {
  id: text('id').primaryKey(),
  internshipId: text('internship_id').notNull().references(() => internships.id, { onDelete: 'cascade' }),
  pembimbingLapanganId: text('pembimbing_lapangan_id').notNull().references(() => pembimbingLapangan.id, { onDelete: 'cascade' }),
  kehadiran: integer('kehadiran').notNull(), // 0-100
  kerjasama: integer('kerjasama').notNull(), // 0-100
  sikapEtika: integer('sikap_etika').notNull(), // 0-100
  prestasiKerja: integer('prestasi_kerja').notNull(), // 0-100
  kreatifitas: integer('kreatifitas').notNull(), // 0-100
  totalScore: integer('total_score').notNull(), // Weighted average
  feedback: text('feedback'),
  pdfUrl: text('pdf_url'),
  pdfGenerated: boolean('pdf_generated').notNull().default(false),
  assessedAt: timestamp('assessed_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Lecturer Assessments Table (Penilaian dari Dosen - 70%)
export const lecturerAssessments = pgTable('lecturer_assessments', {
  id: text('id').primaryKey(),
  internshipId: text('internship_id').notNull().references(() => internships.id, { onDelete: 'cascade' }),
  dosenId: text('dosen_id').notNull().references(() => dosen.id, { onDelete: 'cascade' }),
  formatKesesuaian: integer('format_kesesuaian').notNull(), // 0-100
  penguasaanMateri: integer('penguasaan_materi').notNull(), // 0-100
  analisisPerancangan: integer('analisis_perancangan').notNull(), // 0-100
  sikapEtika: integer('sikap_etika').notNull(), // 0-100
  totalScore: integer('total_score').notNull(), // Weighted average
  feedback: text('feedback'),
  pdfUrl: text('pdf_url'),
  pdfGenerated: boolean('pdf_generated').notNull().default(false),
  assessedAt: timestamp('assessed_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Combined Grades Table (Rekap Nilai: 30% Mentor + 70% Dosen)
export const combinedGrades = pgTable('combined_grades', {
  id: text('id').primaryKey(),
  internshipId: text('internship_id').notNull().unique().references(() => internships.id, { onDelete: 'cascade' }),
  assessmentId: text('assessment_id').references(() => assessments.id, { onDelete: 'set null' }),
  lecturerAssessmentId: text('lecturer_assessment_id').references(() => lecturerAssessments.id, { onDelete: 'set null' }),
  fieldScore: integer('field_score'), // Score dari pembimbing lapangan (30%)
  academicScore: integer('academic_score'), // Score dari dosen (70%)
  finalScore: integer('final_score').notNull(), // Total combined score
  letterGrade: varchar('letter_grade', { length: 2 }), // A, B, C, D, E
  status: approvalStatusEnum('status').notNull().default('PENDING'),
  pdfUrl: text('pdf_url'),
  pdfGenerated: boolean('pdf_generated').notNull().default(false),
  calculatedAt: timestamp('calculated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Reports Table (Laporan Akhir KP)
export const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  internshipId: text('internship_id').notNull().unique().references(() => internships.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }),
  abstract: text('abstract'),
  fileUrl: text('file_url').notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(),
  status: reportStatusEnum('status').notNull().default('DRAFT'),
  submittedAt: timestamp('submitted_at'),
  reviewedBy: text('reviewed_by').references(() => dosen.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  approvalStatus: approvalStatusEnum('approval_status').notNull().default('PENDING'),
  comments: text('comments'),
  revisionNotes: text('revision_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Title Submissions Table (Pengajuan Judul)
export const titleSubmissions = pgTable('title_submissions', {
  id: text('id').primaryKey(),
  internshipId: text('internship_id').notNull().references(() => internships.id, { onDelete: 'cascade' }),
  proposedTitle: varchar('proposed_title', { length: 500 }).notNull(),
  description: text('description'),
  status: titleStatusEnum('status').notNull().default('PENDING'),
  approvedBy: text('approved_by').references(() => dosen.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at'),
  rejectionReason: text('rejection_reason'),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Title Revisions Table (History Revisi Judul)
export const titleRevisions = pgTable('title_revisions', {
  id: text('id').primaryKey(),
  titleSubmissionId: text('title_submission_id').notNull().references(() => titleSubmissions.id, { onDelete: 'cascade' }),
  revisedTitle: varchar('revised_title', { length: 500 }).notNull(),
  changeReason: text('change_reason'),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  requestedBy: text('requested_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

// Notifications Table
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  type: varchar('type', { length: 50 }).notNull(), // info, success, warning, error
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Mentor Approval Requests (Pengajuan pembimbing lapangan oleh mahasiswa)
export const mentorApprovalRequests = pgTable('mentor_approval_requests', {
  id: text('id').primaryKey(),
  studentUserId: text('student_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mentorName: varchar('mentor_name', { length: 255 }).notNull(),
  mentorEmail: varchar('mentor_email', { length: 255 }).notNull(),
  mentorPhone: varchar('mentor_phone', { length: 20 }),
  companyName: varchar('company_name', { length: 255 }),
  position: varchar('position', { length: 100 }),
  companyAddress: text('company_address'),
  status: approvalStatusEnum('status').notNull().default('PENDING'),
  rejectionReason: text('rejection_reason'),
  reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Mentor Email Change Requests
export const mentorEmailChangeRequests = pgTable('mentor_email_change_requests', {
  id: text('id').primaryKey(),
  mentorId: text('mentor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  currentEmail: varchar('current_email', { length: 255 }).notNull(),
  requestedEmail: varchar('requested_email', { length: 255 }).notNull(),
  reason: text('reason'),
  status: approvalStatusEnum('status').notNull().default('PENDING'),
  rejectionReason: text('rejection_reason'),
  reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Mentor Activation Tokens (one-time token for activation/password setup)
export const mentorActivationTokens = pgTable('mentor_activation_tokens', {
  id: text('id').primaryKey(),
  mentorId: text('mentor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Audit Logs for approval/rejection critical actions
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: text('entity_id').notNull(),
  details: json('details').notNull().default('{}'),
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
}));

export const mahasiswaRelations = relations(mahasiswa, ({ one, many }) => ({
  user: one(users, {
    fields: [mahasiswa.id],
    references: [users.id],
  }),
  internships: many(internships),
}));

export const adminRelations = relations(admin, ({ one }) => ({
  user: one(users, {
    fields: [admin.id],
    references: [users.id],
  }),
}));

export const dosenRelations = relations(dosen, ({ one, many }) => ({
  user: one(users, {
    fields: [dosen.id],
    references: [users.id],
  }),
  internships: many(internships),
  lecturerAssessments: many(lecturerAssessments),
  reviewedReports: many(reports),
  approvedTitles: many(titleSubmissions),
}));

export const pembimbingLapanganRelations = relations(pembimbingLapangan, ({ one, many }) => ({
  user: one(users, {
    fields: [pembimbingLapangan.id],
    references: [users.id],
  }),
  internships: many(internships),
  assessments: many(assessments),
  verifiedLogbooks: many(logbooks),
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
  internships: many(internships),
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

// Internship Relations
export const internshipsRelations = relations(internships, ({ one, many }) => ({
  submission: one(submissions, {
    fields: [internships.submissionId],
    references: [submissions.id],
  }),
  mahasiswa: one(mahasiswa, {
    fields: [internships.mahasiswaId],
    references: [mahasiswa.nim],
  }),
  team: one(teams, {
    fields: [internships.teamId],
    references: [teams.id],
  }),
  pembimbingLapangan: one(pembimbingLapangan, {
    fields: [internships.pembimbingLapanganId],
    references: [pembimbingLapangan.id],
  }),
  dosenPembimbing: one(dosen, {
    fields: [internships.dosenPembimbingId],
    references: [dosen.id],
  }),
  logbooks: many(logbooks),
  assessment: one(assessments),
  lecturerAssessment: one(lecturerAssessments),
  combinedGrade: one(combinedGrades),
  report: one(reports),
  titleSubmissions: many(titleSubmissions),
}));

export const logbooksRelations = relations(logbooks, ({ one }) => ({
  internship: one(internships, {
    fields: [logbooks.internshipId],
    references: [internships.id],
  }),
  verifier: one(pembimbingLapangan, {
    fields: [logbooks.verifiedBy],
    references: [pembimbingLapangan.id],
  }),
}));

export const assessmentsRelations = relations(assessments, ({ one }) => ({
  internship: one(internships, {
    fields: [assessments.internshipId],
    references: [internships.id],
  }),
  pembimbingLapangan: one(pembimbingLapangan, {
    fields: [assessments.pembimbingLapanganId],
    references: [pembimbingLapangan.id],
  }),
  combinedGrade: one(combinedGrades),
}));

export const lecturerAssessmentsRelations = relations(lecturerAssessments, ({ one }) => ({
  internship: one(internships, {
    fields: [lecturerAssessments.internshipId],
    references: [internships.id],
  }),
  dosen: one(dosen, {
    fields: [lecturerAssessments.dosenId],
    references: [dosen.id],
  }),
  combinedGrade: one(combinedGrades),
}));

export const combinedGradesRelations = relations(combinedGrades, ({ one }) => ({
  internship: one(internships, {
    fields: [combinedGrades.internshipId],
    references: [internships.id],
  }),
  assessment: one(assessments, {
    fields: [combinedGrades.assessmentId],
    references: [assessments.id],
  }),
  lecturerAssessment: one(lecturerAssessments, {
    fields: [combinedGrades.lecturerAssessmentId],
    references: [lecturerAssessments.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  internship: one(internships, {
    fields: [reports.internshipId],
    references: [internships.id],
  }),
  reviewer: one(dosen, {
    fields: [reports.reviewedBy],
    references: [dosen.id],
  }),
}));

export const titleSubmissionsRelations = relations(titleSubmissions, ({ one, many }) => ({
  internship: one(internships, {
    fields: [titleSubmissions.internshipId],
    references: [internships.id],
  }),
  approver: one(dosen, {
    fields: [titleSubmissions.approvedBy],
    references: [dosen.id],
  }),
  revisions: many(titleRevisions),
}));

export const titleRevisionsRelations = relations(titleRevisions, ({ one }) => ({
  titleSubmission: one(titleSubmissions, {
    fields: [titleRevisions.titleSubmissionId],
    references: [titleSubmissions.id],
  }),
  requester: one(users, {
    fields: [titleRevisions.requestedBy],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));