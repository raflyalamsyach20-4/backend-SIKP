import { eq, lte } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { authSessions } from '@/db/schema';

export class AuthSessionRepository {
  constructor(private db: DbClient) {}

  async createSession(data: typeof authSessions.$inferInsert) {
    const result = await this.db
      .insert(authSessions)
      .values(data)
      .returning();

    return result[0] || null;
  }

  async findSessionById(sessionId: string) {
    const result = await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.sessionId, sessionId))
      .limit(1);

    return result[0] || null;
  }

  async updateSession(sessionId: string, data: Partial<typeof authSessions.$inferInsert>) {
    const result = await this.db
      .update(authSessions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(authSessions.sessionId, sessionId))
      .returning();

    return result[0] || null;
  }

  async deleteSession(sessionId: string) {
    await this.db
      .delete(authSessions)
      .where(eq(authSessions.sessionId, sessionId));
  }

  async deleteExpiredSessions(now: Date = new Date()) {
    await this.db
      .delete(authSessions)
      .where(lte(authSessions.expiresAt, now));
  }

  async getIdentityCache(authUserId: string) {
    void authUserId;
    return [];
  }

  async findIdentity(authUserId: string, identityType: string) {
    void authUserId;
    void identityType;
    return null;
  }

  async replaceIdentityCache(authUserId: string, identities: Array<{
    id: string;
    identityType: string;
    roleName: string;
    metadata?: Record<string, any>;
  }>) {
    void authUserId;
    void identities;
  }
}
