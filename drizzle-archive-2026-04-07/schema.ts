import { pgTable, foreignKey, unique, pgEnum, text, varchar, timestamp, boolean, integer, index, date, jsonb, bigint, json, uniqueIndex } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"

export const documentType = pgEnum("document_type", ['KTP', 'TRANSKRIP', 'KRS', 'PROPOSAL', 'OTHER', 'PROPOSAL_KETUA', 'SURAT_KESEDIAAN', 'FORM_PERMOHONAN', 'KRS_SEMESTER_4', 'DAFTAR_KUMPULAN_NILAI', 'BUKTI_PEMBAYARAN_UKT', 'SURAT_PENGANTAR'])
export const invitationStatus = pgEnum("invitation_status", ['PENDING', 'ACCEPTED', 'REJECTED'])
export const role = pgEnum("role", ['MAHASISWA', 'ADMIN', 'DOSEN', 'KAPRODI', 'WAKIL_DEKAN', 'PEMBIMBING_LAPANGAN'])
export const submissionStatus = pgEnum("submission_status", ['DRAFT', 'MENUNGGU', 'DITOLAK', 'DITERIMA', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'])
export const teamStatus = pgEnum("team_status", ['PENDING', 'FIXED'])
export const teamMemberRole = pgEnum("team_member_role", ['KETUA', 'ANGGOTA'])
export const baDocumentStatus = pgEnum("ba_document_status", ['GENERATING', 'COMPLETED', 'FAILED'])
export const baDocumentType = pgEnum("ba_document_type", ['PDF', 'DOCX'])
export const beritaAcaraStatus = pgEnum("berita_acara_status", ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'])
export const dosenJabatan = pgEnum("dosen_jabatan", ['PEMBIMBING', 'PENGUJI'])
export const historyAction = pgEnum("history_action", ['CREATED', 'UPDATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EDITED_AFTER_REJECTION', 'DOCUMENT_GENERATED', 'DELETED'])
export const signatureType = pgEnum("signature_type", ['DRAW', 'UPLOAD', 'TEXT'])
export const pengajuanSidangStatus = pgEnum("pengajuan_sidang_status", ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'])
export const rolePembimbing = pgEnum("role_pembimbing", ['PEMBIMBING_1', 'PEMBIMBING_2', 'PENGUJI_1', 'PENGUJI_2', 'PENGUJI_3'])
export const letterStatus = pgEnum("letter_status", ['approved', 'rejected'])
export const responseLetterStatus = pgEnum("response_letter_status", ['pending', 'submitted', 'verified'])


export const generatedLetters = pgTable("generated_letters", {
	id: text("id").primaryKey().notNull(),
	submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" } ),
	letterNumber: varchar("letter_number", { length: 100 }).notNull(),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	fileUrl: text("file_url").notNull(),
	fileType: varchar("file_type", { length: 10 }).notNull(),
	generatedBy: text("generated_by").notNull().references(() => users.id),
	generatedAt: timestamp("generated_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		generatedLettersLetterNumberUnique: unique("generated_letters_letter_number_unique").on(table.letterNumber),
	}
});

export const users = pgTable("users", {
	id: text("id").primaryKey().notNull(),
	email: varchar("email", { length: 255 }).notNull(),
	password: text("password").notNull(),
	role: role("role").default('MAHASISWA').notNull(),
	phone: varchar("phone", { length: 20 }),
	nama: varchar("nama", { length: 255 }),
	isActive: boolean("is_active").default(true).notNull(),
},
(table) => {
	return {
		usersEmailUnique: unique("users_email_unique").on(table.email),
	}
});

export const submissionDocuments = pgTable("submission_documents", {
	id: text("id").primaryKey().notNull(),
	submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" } ),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	originalName: varchar("original_name", { length: 255 }).notNull(),
	fileType: varchar("file_type", { length: 100 }).notNull(),
	fileSize: integer("file_size").notNull(),
	fileUrl: text("file_url").notNull(),
	documentType: documentType("document_type").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	memberUserId: text("member_user_id").notNull(),
	uploadedByUserId: text("uploaded_by_user_id").notNull(),
});

export const teamMembers = pgTable("team_members", {
	id: text("id").primaryKey().notNull(),
	teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	userId: text("user_id").notNull().references(() => users.id),
	invitationStatus: invitationStatus("invitation_status").default('PENDING').notNull(),
	invitedAt: timestamp("invited_at", { mode: 'string' }).defaultNow().notNull(),
	respondedAt: timestamp("responded_at", { mode: 'string' }),
	invitedBy: text("invited_by").references(() => users.id),
	role: teamMemberRole("role").default('ANGGOTA').notNull(),
});

export const teams = pgTable("teams", {
	id: text("id").primaryKey().notNull(),
	leaderId: text("leader_id").notNull().references(() => users.id),
	status: teamStatus("status").default('PENDING').notNull(),
	code: varchar("code", { length: 50 }).notNull(),
},
(table) => {
	return {
		teamsCodeUnique: unique("teams_code_unique").on(table.code),
	}
});

export const admin = pgTable("admin", {
	id: text("id").primaryKey().notNull().references(() => users.id, { onDelete: "cascade" } ),
	nip: varchar("nip", { length: 30 }).notNull(),
	fakultas: varchar("fakultas", { length: 100 }),
	prodi: varchar("prodi", { length: 100 }),
},
(table) => {
	return {
		adminNipUnique: unique("admin_nip_unique").on(table.nip),
	}
});

export const dosen = pgTable("dosen", {
	id: text("id").primaryKey().notNull().references(() => users.id, { onDelete: "cascade" } ),
	nip: varchar("nip", { length: 30 }).notNull(),
	jabatan: varchar("jabatan", { length: 100 }),
	fakultas: varchar("fakultas", { length: 100 }),
	prodi: varchar("prodi", { length: 100 }),
	gelarDepan: varchar("gelar_depan", { length: 50 }),
	gelarBelakang: varchar("gelar_belakang", { length: 100 }),
	bidangKeahlian: text("bidang_keahlian"),
	fotoProfile: text("foto_profile"),
	noRuangan: varchar("no_ruangan", { length: 20 }),
	jadwalKonsultasi: text("jadwal_konsultasi"),
	statusKetersediaan: varchar("status_ketersediaan", { length: 20 }).default('TERSEDIA'::character varying),
	tentang: text("tentang"),
	penelitian: text("penelitian"),
	publikasi: text("publikasi"),
	profileCompleted: boolean("profile_completed").default(false).notNull(),
	esignatureUrl: text("esignature_url"),
	profileCompletedAt: timestamp("profile_completed_at", { mode: 'string' }),
	lastLoginAt: timestamp("last_login_at", { mode: 'string' }),
},
(table) => {
	return {
		idxDosenProfileCompleted: index("idx_dosen_profile_completed").on(table.profileCompleted),
		idxDosenLastLogin: index("idx_dosen_last_login").on(table.lastLoginAt),
		dosenNipUnique: unique("dosen_nip_unique").on(table.nip),
	}
});

export const submissions = pgTable("submissions", {
	id: text("id").primaryKey().notNull(),
	teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	companyName: varchar("company_name", { length: 255 }).notNull(),
	companyAddress: text("company_address").notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date").notNull(),
	status: submissionStatus("status").default('DRAFT').notNull(),
	rejectionReason: text("rejection_reason"),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	submittedAt: timestamp("submitted_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	letterPurpose: varchar("letter_purpose", { length: 255 }).notNull(),
	division: varchar("division", { length: 255 }).notNull(),
	approvedBy: text("approved_by").references(() => users.id, { onDelete: "set null" } ),
	statusHistory: jsonb("status_history").default([]).notNull(),
	documentReviews: jsonb("document_reviews").default({}),
	responseLetterStatus: responseLetterStatus("response_letter_status").default('pending'),
},
(table) => {
	return {
		idxSubmissionApprovedBy: index("idx_submission_approved_by").on(table.approvedBy),
		idxSubmissionsStatusHistory: index("idx_submissions_status_history").on(table.statusHistory),
		idxSubmissionsDocumentReviews: index("idx_submissions_document_reviews").on(table.documentReviews),
	}
});

export const mahasiswa = pgTable("mahasiswa", {
	nim: varchar("nim", { length: 20 }).primaryKey().notNull(),
	id: text("id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	fakultas: varchar("fakultas", { length: 100 }),
	prodi: varchar("prodi", { length: 100 }),
	semester: integer("semester"),
	angkatan: varchar("angkatan", { length: 10 }),
},
(table) => {
	return {
		mahasiswaIdUnique: unique("mahasiswa_id_unique").on(table.id),
	}
});

export const pembimbingLapangan = pgTable("pembimbing_lapangan", {
	id: text("id").primaryKey().notNull().references(() => users.id, { onDelete: "cascade" } ),
	companyName: varchar("company_name", { length: 255 }),
	position: varchar("position", { length: 100 }),
	companyAddress: text("company_address"),
});

export const responseLetters = pgTable("response_letters", {
	id: text("id").primaryKey().notNull(),
	submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" } ),
	fileName: varchar("file_name", { length: 255 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }),
	fileUrl: text("file_url"),
	letterStatus: letterStatus("letter_status").notNull(),
	submittedAt: timestamp("submitted_at", { mode: 'string' }).defaultNow().notNull(),
	verified: boolean("verified").default(false).notNull(),
	verifiedAt: timestamp("verified_at", { mode: 'string' }),
	verifiedByAdminId: text("verified_by_admin_id").references(() => users.id, { onDelete: "set null" } ),
	fileType: varchar("file_type", { length: 100 }),
	originalName: varchar("original_name", { length: 255 }),
	memberUserId: text("member_user_id").references(() => users.id, { onDelete: "set null" } ),
},
(table) => {
	return {
		idxResponseLettersSubmissionId: index("idx_response_letters_submission_id").on(table.submissionId),
		idxResponseLettersVerified: index("idx_response_letters_verified").on(table.verified),
	}
});

export const beritaAcara = pgTable("berita_acara", {
	id: text("id").primaryKey().notNull(),
	mahasiswaId: text("mahasiswa_id").notNull(),
	timId: text("tim_id"),
	judulLaporan: varchar("judul_laporan", { length: 500 }).notNull(),
	tempatPelaksanaan: varchar("tempat_pelaksanaan", { length: 255 }).notNull(),
	tanggalSidang: timestamp("tanggal_sidang", { withTimezone: true, mode: 'string' }).notNull(),
	waktuMulai: varchar("waktu_mulai", { length: 5 }).notNull(),
	waktuSelesai: varchar("waktu_selesai", { length: 5 }).notNull(),
	status: beritaAcaraStatus("status").default('DRAFT').notNull(),
	nilaiAkhir: integer("nilai_akhir"),
	grade: varchar("grade", { length: 2 }),
	predikat: varchar("predikat", { length: 50 }),
	catatanDosen: text("catatan_dosen"),
	verifiedBy: text("verified_by"),
	tanggalVerifikasi: timestamp("tanggal_verifikasi", { withTimezone: true, mode: 'string' }),
	tanggalApproval: timestamp("tanggal_approval", { withTimezone: true, mode: 'string' }),
	nomorSurat: varchar("nomor_surat", { length: 50 }),
	documentPdfUrl: varchar("document_pdf_url", { length: 500 }),
	documentDocxUrl: varchar("document_docx_url", { length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
},
(table) => {
	return {
		beritaAcaraNomorSuratUnique: unique("berita_acara_nomor_surat_unique").on(table.nomorSurat),
	}
});

export const beritaAcaraDocuments = pgTable("berita_acara_documents", {
	id: text("id").primaryKey().notNull(),
	beritaAcaraId: text("berita_acara_id").notNull(),
	documentType: baDocumentType("document_type").notNull(),
	documentUrl: varchar("document_url", { length: 500 }).notNull(),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	fileSize: integer("file_size").notNull(),
	status: baDocumentStatus("status").default('GENERATING').notNull(),
	errorMessage: text("error_message"),
	nomorSurat: varchar("nomor_surat", { length: 50 }).notNull(),
	version: integer("version").default(1).notNull(),
	isLatest: boolean("is_latest").default(true).notNull(),
	generatedBy: text("generated_by").notNull(),
	metadata: text("metadata"),
	downloadCount: integer("download_count").default(0).notNull(),
	lastDownloadedAt: timestamp("last_downloaded_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const beritaAcaraHistory = pgTable("berita_acara_history", {
	id: text("id").primaryKey().notNull(),
	beritaAcaraId: text("berita_acara_id").notNull(),
	action: historyAction("action").notNull(),
	description: text("description"),
	actorId: text("actor_id").notNull(),
	actorRole: varchar("actor_role", { length: 50 }).notNull(),
	previousData: text("previous_data"),
	newData: text("new_data"),
	changes: text("changes"),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const dosenPenguji = pgTable("dosen_penguji", {
	id: text("id").primaryKey().notNull(),
	beritaAcaraId: text("berita_acara_id").notNull(),
	dosenId: text("dosen_id").notNull(),
	dosenNama: varchar("dosen_nama", { length: 255 }).notNull(),
	dosenNip: varchar("dosen_nip", { length: 50 }).notNull(),
	jabatan: dosenJabatan("jabatan").notNull(),
	hasSigned: boolean("has_signed").default(false).notNull(),
	signedAt: timestamp("signed_at", { withTimezone: true, mode: 'string' }),
	signatureId: text("signature_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const dosenSignatures = pgTable("dosen_signatures", {
	id: text("id").primaryKey().notNull(),
	dosenId: text("dosen_id").notNull(),
	signatureType: signatureType("signature_type").notNull(),
	signatureImage: text("signature_image").notNull(),
	fileName: varchar("file_name", { length: 255 }),
	fileSize: integer("file_size"),
	mimeType: varchar("mime_type", { length: 100 }),
	dosenNama: varchar("dosen_nama", { length: 255 }).notNull(),
	dosenNip: varchar("dosen_nip", { length: 50 }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const notifikasiDosen = pgTable("notifikasi_dosen", {
	id: text("id").primaryKey().notNull(),
	dosenId: text("dosen_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	type: varchar("type", { length: 50 }).notNull(),
	title: varchar("title", { length: 255 }).notNull(),
	message: text("message").notNull(),
	referenceType: varchar("reference_type", { length: 50 }),
	referenceId: text("reference_id"),
	isRead: boolean("is_read").default(false).notNull(),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxNotifikasiDosen: index("idx_notifikasi_dosen").on(table.dosenId),
		idxNotifikasiUnread: index("idx_notifikasi_unread").on(table.dosenId, table.isRead),
		idxNotifikasiReference: index("idx_notifikasi_reference").on(table.referenceId, table.referenceType),
	}
});

export const templates = pgTable("templates", {
	id: text("id").primaryKey().notNull(),
	name: varchar("name", { length: 255 }).notNull(),
	type: varchar("type", { length: 50 }).notNull(),
	description: text("description"),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	fileUrl: text("file_url").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }).notNull(),
	fileType: varchar("file_type", { length: 100 }).notNull(),
	originalName: varchar("original_name", { length: 255 }).notNull(),
	fields: json("fields"),
	version: integer("version").default(1).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" } ),
	updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" } ),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxTemplatesType: index("idx_templates_type").on(table.type),
		idxTemplatesIsActive: index("idx_templates_is_active").on(table.isActive),
		idxTemplatesCreatedAt: index("idx_templates_created_at").on(table.createdAt),
	}
});

export const pengajuanSidang = pgTable("pengajuan_sidang", {
	id: text("id").primaryKey().notNull(),
	kodePengajuan: varchar("kode_pengajuan", { length: 50 }).notNull(),
	mahasiswaId: text("mahasiswa_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	timId: text("tim_id").references(() => teams.id, { onDelete: "set null" } ),
	judulLaporan: text("judul_laporan").notNull(),
	tempatPelaksanaan: varchar("tempat_pelaksanaan", { length: 255 }).notNull(),
	tanggalSidang: timestamp("tanggal_sidang", { withTimezone: true, mode: 'string' }).notNull(),
	waktuMulai: varchar("waktu_mulai", { length: 5 }).notNull(),
	waktuSelesai: varchar("waktu_selesai", { length: 5 }).notNull(),
	fileLaporanUrl: text("file_laporan_url"),
	fileProposalUrl: text("file_proposal_url"),
	filePendukungUrl: text("file_pendukung_url").array(),
	status: pengajuanSidangStatus("status").default('DRAFT').notNull(),
	dosenPembimbingId: text("dosen_pembimbing_id").references(() => users.id, { onDelete: "set null" } ),
	tanggalVerifikasi: timestamp("tanggal_verifikasi", { withTimezone: true, mode: 'string' }),
	catatanDosen: text("catatan_dosen"),
	tanggalPengajuan: timestamp("tanggal_pengajuan", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
},
(table) => {
	return {
		idxPengajuanStatus: index("idx_pengajuan_status").on(table.status),
		idxPengajuanDosen: index("idx_pengajuan_dosen").on(table.dosenPembimbingId),
		idxPengajuanMahasiswa: index("idx_pengajuan_mahasiswa").on(table.mahasiswaId),
		idxPengajuanTim: index("idx_pengajuan_tim").on(table.timId),
		idxPengajuanTanggal: index("idx_pengajuan_tanggal").on(table.tanggalSidang),
		idxPengajuanKode: index("idx_pengajuan_kode").on(table.kodePengajuan),
		pengajuanSidangKodePengajuanKey: unique("pengajuan_sidang_kode_pengajuan_key").on(table.kodePengajuan),
	}
});

export const timPembimbing = pgTable("tim_pembimbing", {
	id: text("id").primaryKey().notNull(),
	timId: text("tim_id").references(() => teams.id, { onDelete: "cascade" } ),
	mahasiswaId: text("mahasiswa_id").references(() => users.id, { onDelete: "cascade" } ),
	dosenId: text("dosen_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	role: rolePembimbing("role").notNull(),
	status: varchar("status", { length: 20 }).default('ACTIVE'::character varying).notNull(),
	tanggalMulai: timestamp("tanggal_mulai", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tanggalSelesai: timestamp("tanggal_selesai", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxTimPembimbingTim: index("idx_tim_pembimbing_tim").on(table.timId),
		idxTimPembimbingMahasiswa: index("idx_tim_pembimbing_mahasiswa").on(table.mahasiswaId),
		idxTimPembimbingDosen: index("idx_tim_pembimbing_dosen").on(table.dosenId),
		idxTimPembimbingStatus: index("idx_tim_pembimbing_status").on(table.status),
		idxTimPembimbingUnique: uniqueIndex("idx_tim_pembimbing_unique").on(table.dosenId, table.role, table.timId),
	}
});