import { asc, eq } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { submissions, submissionDocuments, generatedLetters } from '@/db/schema';

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
    const result = await this.db.insert(submissionDocuments).values(data).returning();
    return result[0];
  }

  async findDocumentsBySubmissionId(submissionId: string) {
    return await this.db
      .select()
      .from(submissionDocuments)
      .where(eq(submissionDocuments.submissionId, submissionId))
      .orderBy(asc(submissionDocuments.documentType), asc(submissionDocuments.createdAt));
  }

  async findDocumentById(id: string) {
    const result = await this.db.select().from(submissionDocuments).where(eq(submissionDocuments.id, id)).limit(1);
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
}
