import { asc, eq, desc, inArray, and, isNull } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { submissions, submissionDocuments, generatedLetters, teams, teamMembers } from '@/db/schema';

type TeamMemberRow = {
  id: string;
  teamId: string;
  mahasiswaId: string;
  role: string | null;
  status: string;
  invitedAt: Date;
  respondedAt: Date | null;
};

type TeamMemberWithUser = TeamMemberRow & {
  user: {
    id: string;
    name: null;
    email: null;
    nim: null;
    prodi: null;
  };
};

export class SubmissionRepository {
  constructor(private db: DbClient) { }

  async findWakilDekanSignature(): Promise<{
    id: string;
    name: string;
    nip: string;
    position: string;
  } | null> {
    // Default placeholder preview surat pengantar wakdek
    return {
      id: 'official-wakdek-1',
      name: 'Wakil Dekan 1',
      nip: '197802012005011002',
      position: 'Wakil Dekan Bidang Akademik',
      esignatureUrl: 'https://api.dicebear.com/7.x/initials/png?seed=WD' // Placeholder signature (PNG for jsPDF compatibility)
    };
  }

  async resolveAcademicSupervisorByLeaderMahasiswaId(leaderMahasiswaId?: string | null) {
    return null;
  }

  async resolveTeamKpSupervisorByTeamId(teamId?: string | null) {
    if (!teamId) {
      return null;
    }

    const result = await this.db
      .select({
        dosenKpId: teams.dosenKpId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    return result[0]?.dosenKpId ?? null;
  }

  async findById(id: string) {
    const result = await this.db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
    return result[0] || null;
  }

  /**
   * Find submission by ID with team, members, and documents
   * Used by admin to view submission details with documentReviews
   */
  async findByIdWithTeam(id: string) {
    const submission = await this.findById(id);
    if (!submission) {
      return null;
    }

    const wakilDekanSignature = await this.findWakilDekanSignature();

    // Get team with leader
    const teamData = await this.db
      .select()
      .from(teams)
      .where(eq(teams.id, submission.teamId))
      .limit(1);

    const team = teamData[0];
    let teamMembers_list: TeamMemberWithUser[] = [];

    let academicSupervisor: string | null = null;
    let dosenKpName: string | null = null;

    if (team) {
      // Resolve real dosen PA from team leader's mahasiswa profile
      academicSupervisor = await this.resolveAcademicSupervisorByLeaderMahasiswaId(team.leaderMahasiswaId);
      dosenKpName = await this.resolveTeamKpSupervisorByTeamId(team.id);

      // Get team members with user info
      const membersData = await this.db
        .select({
          id: teamMembers.id,
          teamId: teamMembers.teamId,
          mahasiswaId: teamMembers.mahasiswaId,
          role: teamMembers.role,
          status: teamMembers.invitationStatus,
          invitedAt: teamMembers.invitedAt,
          respondedAt: teamMembers.respondedAt,
        })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, submission.teamId));

      teamMembers_list = (membersData as TeamMemberRow[]).map((member) => ({
        ...member,
        user: {
          id: member.mahasiswaId,
          name: null,
          email: null,
          nim: null,
          prodi: null,
        },
      }));
    }

    // Get documents with user info
    const docs = await this.findDocumentsBySubmissionId(submission.id);

    // Filter out invalid documents
    const validDocs = docs.filter(doc => doc.documentType);

    return {
      ...submission, // ✅ This includes documentReviews from submissions table
      wakilDekanSignature,
      team: team
        ? {
          ...team,
          dosenKpName,
          academicSupervisor,
          members: teamMembers_list.map((m) => ({
            id: m.id,
            user: m.user,
            role: m.role,
            status: m.status,
          })),
        }
        : null,
      documents: validDocs,
    };
  }

  /**
   * Find active (non-archived) submissions for a team.
   * Used by student-facing flows. Archived submissions (from previous reset
   * attempts) are excluded so only the current active submission is returned.
   */
  async findByTeamId(teamId: string) {
    return await this.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.teamId, teamId), isNull(submissions.archivedAt)));
  }

  /**
   * Find ALL submissions for a team, including archived ones.
   * Used by admin/dosen to view full history of a team's KP attempts.
   */
  async findAllByTeamId(teamId: string) {
    return await this.db.select().from(submissions).where(eq(submissions.teamId, teamId));
  }

  async findAll() {
    return await this.db.select().from(submissions);
  }

  async findByStatus(status: 'DRAFT' | 'PENDING_REVIEW' | 'REJECTED' | 'APPROVED') {
    return await this.db.select().from(submissions).where(eq(submissions.status, status));
  }

  async findByWorkflowStage(
    workflowStage:
      | 'DRAFT'
      | 'PENDING_ADMIN_REVIEW'
      | 'PENDING_DOSEN_VERIFICATION'
      | 'COMPLETED'
      | 'REJECTED_ADMIN'
      | 'REJECTED_DOSEN'
  ) {
    return await this.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.workflowStage, workflowStage), isNull(submissions.archivedAt)));
  }

  async create(data: typeof submissions.$inferInsert) {
    const result = await this.db.insert(submissions).values(data).returning();
    return result[0];
  }

  async update(id: string, data: Partial<typeof submissions.$inferInsert>) {
    const result = await this.db
      .update(submissions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(submissions.id, id))
      .returning();
    return result[0];
  }

  async addDocument(data: typeof submissionDocuments.$inferInsert) {
    const result = await this.db
      .insert(submissionDocuments)
      .values(data)
      .returning({
        id: submissionDocuments.id,
        submissionId: submissionDocuments.submissionId,
        documentType: submissionDocuments.documentType,
        memberMahasiswaId: submissionDocuments.memberMahasiswaId,
        uploadedByMahasiswaId: submissionDocuments.uploadedByMahasiswaId,
        originalName: submissionDocuments.originalName,
        fileName: submissionDocuments.fileName,
        fileType: submissionDocuments.fileType,
        fileSize: submissionDocuments.fileSize,
        fileUrl: submissionDocuments.fileUrl,
        // ✅ NEW: Document status fields
        status: submissionDocuments.status,
        statusUpdatedAt: submissionDocuments.statusUpdatedAt,
        createdAt: submissionDocuments.createdAt,
      });
    return result[0];
  }

  async findDocumentsBySubmissionId(submissionId: string) {
    const rows = await this.db
      .select({
        id: submissionDocuments.id,
        submissionId: submissionDocuments.submissionId,
        documentType: submissionDocuments.documentType,
        memberMahasiswaId: submissionDocuments.memberMahasiswaId,
        uploadedByMahasiswaId: submissionDocuments.uploadedByMahasiswaId,
        originalName: submissionDocuments.originalName,
        fileName: submissionDocuments.fileName,
        fileType: submissionDocuments.fileType,
        fileSize: submissionDocuments.fileSize,
        fileUrl: submissionDocuments.fileUrl,
        // ✅ NEW: Document status fields
        status: submissionDocuments.status,
        statusUpdatedAt: submissionDocuments.statusUpdatedAt,
        createdAt: submissionDocuments.createdAt,
      })
      .from(submissionDocuments)
      .where(eq(submissionDocuments.submissionId, submissionId))
      .orderBy(desc(submissionDocuments.createdAt));

    return rows.map((row) => ({
      ...row,
      uploadedByUser: {
        id: row.uploadedByMahasiswaId,
        name: null,
        email: null,
        nim: null,
        prodi: null,
      },
    }));
  }

  async findDocumentById(id: string) {
    const result = await this.db
      .select({
        id: submissionDocuments.id,
        submissionId: submissionDocuments.submissionId,
        documentType: submissionDocuments.documentType,
        memberMahasiswaId: submissionDocuments.memberMahasiswaId,
        uploadedByMahasiswaId: submissionDocuments.uploadedByMahasiswaId,
        originalName: submissionDocuments.originalName,
        fileName: submissionDocuments.fileName,
        fileType: submissionDocuments.fileType,
        fileSize: submissionDocuments.fileSize,
        fileUrl: submissionDocuments.fileUrl,
        // ✅ NEW: Document status fields
        status: submissionDocuments.status,
        statusUpdatedAt: submissionDocuments.statusUpdatedAt,
        createdAt: submissionDocuments.createdAt,
      })
      .from(submissionDocuments)
      .where(eq(submissionDocuments.id, id))
      .limit(1);

    const row = result[0];
    if (!row) {
      return null;
    }

    return {
      ...row,
      uploadedByUser: {
        id: row.uploadedByMahasiswaId,
        name: null,
        email: null,
        nim: null,
        prodi: null,
      },
    };
  }

  // ✅ NEW: Update document status
  async updateDocumentStatus(documentId: string, newStatus: 'PENDING' | 'APPROVED' | 'REJECTED') {
    const result = await this.db
      .update(submissionDocuments)
      .set({
        status: newStatus,
        statusUpdatedAt: new Date(),
      })
      .where(eq(submissionDocuments.id, documentId))
      .returning();
    return result[0] || null;
  }

  // ✅ NEW: Find existing document by submissionId, documentType, and memberMahasiswaId
  async findExistingDocument(
    submissionId: string,
    documentType: typeof submissionDocuments.$inferSelect.documentType,
    memberMahasiswaId: string
  ) {
    const result = await this.db
      .select({
        id: submissionDocuments.id,
        submissionId: submissionDocuments.submissionId,
        documentType: submissionDocuments.documentType,
        memberMahasiswaId: submissionDocuments.memberMahasiswaId,
        uploadedByMahasiswaId: submissionDocuments.uploadedByMahasiswaId,
        originalName: submissionDocuments.originalName,
        fileName: submissionDocuments.fileName,
        fileType: submissionDocuments.fileType,
        fileSize: submissionDocuments.fileSize,
        fileUrl: submissionDocuments.fileUrl,
        status: submissionDocuments.status,
        statusUpdatedAt: submissionDocuments.statusUpdatedAt,
        createdAt: submissionDocuments.createdAt,
      })
      .from(submissionDocuments)
      .where(
        and(
          eq(submissionDocuments.submissionId, submissionId),
          eq(submissionDocuments.documentType, documentType),
          eq(submissionDocuments.memberMahasiswaId, memberMahasiswaId)
        )
      )
      .limit(1);
    return result[0] || null;
  }

  // ✅ NEW: Delete document from database
  async deleteDocument(documentId: string) {
    const result = await this.db
      .delete(submissionDocuments)
      .where(eq(submissionDocuments.id, documentId))
      .returning();
    return result[0] || null;
  }

  async addGeneratedLetter(data: typeof generatedLetters.$inferInsert) {
    const result = await this.db.insert(generatedLetters).values(data).returning();
    return result[0];
  }

  async findLettersBySubmissionId(submissionId: string) {
    return await this.db.select().from(generatedLetters).where(eq(generatedLetters.submissionId, submissionId));
  }

  async findLetterByNumber(letterNumber: string) {
    const result = await this.db.select().from(generatedLetters).where(eq(generatedLetters.letterNumber, letterNumber)).limit(1);
    return result[0] || null;
  }

  /**
   * Find submissions for admin list (DB-only query)
   * Filter by status: PENDING_REVIEW, APPROVED, REJECTED
   * Sort by submittedAt DESC
   */
  async findAllForAdmin() {
    return await this.db
      .select()
      .from(submissions)
      .where(inArray(submissions.status, ['PENDING_REVIEW', 'APPROVED', 'REJECTED']))
      .orderBy(desc(submissions.submittedAt));
  }

  /**
   * Create dummy SURAT_PENGANTAR document when admin approves submission
   * Called automatically by AdminService.updateSubmissionStatus when status = APPROVED
   * 
   * @param submissionId - The submission ID
   * @param adminId - The admin user ID who approved
   * @param teamId - The team ID (for generating team code in filename)
   * @returns Created document
   */
  async createCoverLetterDocument(submissionId: string, adminId: string, teamId: string) {
    // Get team to include team code in filename
    const teamData = await this.db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    const team = teamData[0];
    const teamCode = team?.code || 'UNKNOWN';
    const timestamp = Date.now();

    // Generate dummy document data
    const documentData = {
      id: `doc-${timestamp}`,
      submissionId,
      documentType: 'SURAT_PENGANTAR' as const,
      memberMahasiswaId: adminId, // System-generated, uploaded by admin
      uploadedByMahasiswaId: adminId,
      originalName: `Surat_Pengantar_Kerja_Praktik_${teamCode}.pdf`,
      fileName: `Surat_Pengantar_Kerja_Praktik_${teamCode}_${timestamp}.pdf`,
      fileType: 'application/pdf',
      fileSize: 1024000, // Dummy size ~1MB
      fileUrl: `/uploads/submissions/${submissionId}/Surat_Pengantar_Kerja_Praktik_${teamCode}_${timestamp}.pdf`,
      createdAt: new Date(),
    };

    console.log('[createCoverLetterDocument] Creating dummy SURAT_PENGANTAR:', {
      submissionId,
      adminId,
      teamCode,
      fileName: documentData.fileName
    });

    return await this.addDocument(documentData);
  }

  /**
   * Update response letter status on submission
   */
  async updateResponseLetterStatus(
    submissionId: string,
    status: 'pending' | 'submitted' | 'verified'
  ) {
    return await this.update(submissionId, {
      responseLetterStatus: status,
    });
  }
}
