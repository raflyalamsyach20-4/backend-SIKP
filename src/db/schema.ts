import { pgTable, text, timestamp, boolean, pgEnum, varchar, integer, uniqueIndex, bigint, json, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const roleEnum = pgEnum('role', ['MAHASISWA', 'ADMIN', 'DOSEN', 'KAPRODI', 'WAKIL_DEKAN', 'PEMBIMBING_LAPANGAN']);
export const teamStatusEnum = pgEnum('team_status', ['PENDING', 'FIXED']);
export const invitationStatusEnum = pgEnum('invitation_status', ['PENDING', 'ACCEPTED', 'REJECTED']);
export const submissionStatusEnum = pgEnum('submission_status', ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED']);
export const documentTypeEnum = pgEnum('document_type', ['PROPOSAL_KETUA', 'SURAT_KESEDIAAN', 'FORM_PERMOHONAN', 'KRS_SEMESTER_4', 'DAFTAR_KUMPULAN_NILAI', 'BUKTI_PEMBAYARAN_UKT']);

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
  companySupervisor: varchar('company_supervisor', { length: 255 }).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  status: submissionStatusEnum('status').notNull().default('DRAFT'),
  rejectionReason: text('rejection_reason'),
  submittedAt: timestamp('submitted_at'),
  approvedBy: text('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
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
  approver: one(users, {
    fields: [submissions.approvedBy],
    references: [users.id],
  }),
  documents: many(submissionDocuments),
  letters: many(generatedLetters),
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