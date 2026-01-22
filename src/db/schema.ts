import { pgTable, text, timestamp, pgEnum, varchar, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const teamStatusEnum = pgEnum('team_status', ['PENDING', 'FIXED']);
export const invitationStatusEnum = pgEnum('invitation_status', ['PENDING', 'ACCEPTED', 'REJECTED']);
export const submissionStatusEnum = pgEnum('submission_status', ['DRAFT', 'MENUNGGU', 'DITOLAK', 'DITERIMA']);
export const documentTypeEnum = pgEnum('document_type', ['KTP', 'TRANSKRIP', 'KRS', 'PROPOSAL', 'OTHER']);

// Teams Table
// leaderId now references userId from Auth Service (stored as text)
export const teams = pgTable('teams', {
  id: text('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  leaderId: text('leader_id').notNull(), // Auth Service user ID
  status: teamStatusEnum('status').notNull().default('PENDING'),
});

// Team Members Table (includes invitations)
// userId now references userId from Auth Service (stored as text)
export const teamMembers = pgTable('team_members', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // Auth Service user ID
  role: text('role').notNull().default('ANGGOTA'), // KETUA or ANGGOTA
  invitationStatus: invitationStatusEnum('invitation_status').notNull().default('PENDING'),
  invitedAt: timestamp('invited_at').defaultNow().notNull(),
  respondedAt: timestamp('responded_at'),
  invitedBy: text('invited_by'), // Auth Service user ID who sent the invitation
});

// Submissions Table
// approvedBy now references userId from Auth Service
export const submissions = pgTable('submissions', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  companyAddress: text('company_address').notNull(),
  companyPhone: varchar('company_phone', { length: 50 }),
  companyEmail: varchar('company_email', { length: 255 }),
  companySupervisor: varchar('company_supervisor', { length: 255 }),
  position: varchar('position', { length: 255 }),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  description: text('description'),
  status: submissionStatusEnum('status').notNull().default('DRAFT'),
  rejectionReason: text('rejection_reason'),
  approvedBy: text('approved_by'), // Auth Service user ID
  approvedAt: timestamp('approved_at'),
  submittedAt: timestamp('submitted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Submission Documents Table
// uploadedBy now references userId from Auth Service
export const submissionDocuments = pgTable('submission_documents', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 50 }).notNull(),
  fileSize: integer('file_size').notNull(),
  fileUrl: text('file_url').notNull(),
  documentType: documentTypeEnum('document_type').notNull(),
  uploadedBy: text('uploaded_by').notNull(), // Auth Service user ID
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Generated Letters Table
// generatedBy now references userId from Auth Service
export const generatedLetters = pgTable('generated_letters', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  letterNumber: varchar('letter_number', { length: 100 }).notNull().unique(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileUrl: text('file_url').notNull(),
  fileType: varchar('file_type', { length: 10 }).notNull(), // PDF or DOCX
  generatedBy: text('generated_by').notNull(), // Auth Service user ID
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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
