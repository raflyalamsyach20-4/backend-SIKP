import { asc, eq, desc, inArray } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { submissions, submissionDocuments, generatedLetters, teams, teamMembers, users, mahasiswa } from '@/db/schema';

export class SubmissionRepository {
  constructor(private db: DbClient) {}

  async findById(id: string) {
    const result = await this.db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
    return result[0] || null;
  }

  async findByTeamId(teamId: string) {
    return await this.db.select().from(submissions).where(eq(submissions.teamId, teamId));
  }

  async findAll() {
    return await this.db.select().from(submissions);
  }

  async findByStatus(status: 'DRAFT' | 'PENDING_REVIEW' | 'REJECTED' | 'APPROVED') {
    return await this.db.select().from(submissions).where(eq(submissions.status, status));
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
        memberUserId: submissionDocuments.memberUserId,
        uploadedByUserId: submissionDocuments.uploadedByUserId,
        originalName: submissionDocuments.originalName,
        fileName: submissionDocuments.fileName,
        fileType: submissionDocuments.fileType,
        fileSize: submissionDocuments.fileSize,
        fileUrl: submissionDocuments.fileUrl,
        createdAt: submissionDocuments.createdAt,
      });
    return result[0];
  }

  async findDocumentsBySubmissionId(submissionId: string) {
    return await this.db
      .select({
        id: submissionDocuments.id,
        submissionId: submissionDocuments.submissionId,
        documentType: submissionDocuments.documentType,
        memberUserId: submissionDocuments.memberUserId,
        uploadedByUserId: submissionDocuments.uploadedByUserId,
        originalName: submissionDocuments.originalName,
        fileName: submissionDocuments.fileName,
        fileType: submissionDocuments.fileType,
        fileSize: submissionDocuments.fileSize,
        fileUrl: submissionDocuments.fileUrl,
        createdAt: submissionDocuments.createdAt,
        uploadedByUser: {
          id: users.id,
          name: users.nama,
          email: users.email,
        },
      })
      .from(submissionDocuments)
      .leftJoin(users, eq(submissionDocuments.uploadedByUserId, users.id))
      .where(eq(submissionDocuments.submissionId, submissionId))
      .orderBy(asc(submissionDocuments.documentType), asc(submissionDocuments.createdAt));
  }

  async findDocumentById(id: string) {
    const result = await this.db
      .select({
        id: submissionDocuments.id,
        submissionId: submissionDocuments.submissionId,
        documentType: submissionDocuments.documentType,
        memberUserId: submissionDocuments.memberUserId,
        uploadedByUserId: submissionDocuments.uploadedByUserId,
        originalName: submissionDocuments.originalName,
        fileName: submissionDocuments.fileName,
        fileType: submissionDocuments.fileType,
        fileSize: submissionDocuments.fileSize,
        fileUrl: submissionDocuments.fileUrl,
        createdAt: submissionDocuments.createdAt,
        uploadedByUser: {
          id: users.id,
          name: users.nama,
          email: users.email,
        },
      })
      .from(submissionDocuments)
      .leftJoin(users, eq(submissionDocuments.uploadedByUserId, users.id))
      .where(eq(submissionDocuments.id, id))
      .limit(1);
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
   * Find all submissions with team, members, and documents relations for admin view
   * Filter by status: PENDING_REVIEW, APPROVED, REJECTED
   * Sort by submittedAt DESC
   */
  async findAllForAdmin() {
    // Get all submissions with specified statuses
    const submissionList = await this.db
      .select()
      .from(submissions)
      .where(
        inArray(submissions.status, ['PENDING_REVIEW', 'APPROVED', 'REJECTED'])
      )
      .orderBy(desc(submissions.submittedAt));

    // For each submission, fetch team with members and documents
    const result = await Promise.all(
      submissionList.map(async (submission) => {
        // Get team with leader
        const teamData = await this.db
          .select()
          .from(teams)
          .where(eq(teams.id, submission.teamId))
          .limit(1);

        let team = teamData[0];
        let teamMembers_list: any[] = [];

        if (team) {
          // Get team members with user info
          const membersData = await this.db
            .select({
              id: teamMembers.id,
              teamId: teamMembers.teamId,
              userId: teamMembers.userId,
              role: teamMembers.role,
              status: teamMembers.invitationStatus,
              invitedAt: teamMembers.invitedAt,
              respondedAt: teamMembers.respondedAt,
              user: {
                id: users.id,
                name: users.nama,
                email: users.email,
                nim: mahasiswa.nim,
                prodi: mahasiswa.prodi,
              },
            })
            .from(teamMembers)
            .innerJoin(users, eq(teamMembers.userId, users.id))
            .leftJoin(mahasiswa, eq(users.id, mahasiswa.id))
            .where(eq(teamMembers.teamId, submission.teamId));

          teamMembers_list = membersData;
        }

        // Get documents
        const docs = await this.findDocumentsBySubmissionId(submission.id);
        
        // Filter out invalid documents (documentType undefined/null)
        const validDocs = docs.filter(doc => {
          if (!doc.documentType) {
            console.warn(`[findAllForAdmin] Filtering invalid document ${doc.id} - documentType is ${doc.documentType}`);
            return false;
          }
          return true;
        });
        
        console.log(`[findAllForAdmin] Submission ${submission.id} documents:`, {
          totalCount: docs.length,
          validCount: validDocs.length,
          filteredCount: docs.length - validDocs.length,
          firstDoc: validDocs[0] ? {
            id: validDocs[0].id,
            type: validDocs[0].documentType,
            hasUploadedByUser: !!validDocs[0].uploadedByUser,
            uploadedByUser: validDocs[0].uploadedByUser
          } : null
        });

        return {
          ...submission,
          team: team
            ? {
                ...team,
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
      })
    );

    return result;
  }
}
