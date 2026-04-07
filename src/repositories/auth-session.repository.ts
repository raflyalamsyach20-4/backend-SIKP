import { and, eq, lte } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { userActiveIdentitySessions, userIdentityCache } from '@/db/schema';

export class AuthSessionRepository {
  constructor(private db: DbClient) {}

  async createSession(data: typeof userActiveIdentitySessions.$inferInsert) {
    const result = await this.db
      .insert(userActiveIdentitySessions)
      .values(data)
      .returning();

    return result[0] || null;
  }

  async findSessionById(sessionId: string) {
    const result = await this.db
      .select()
      .from(userActiveIdentitySessions)
      .where(eq(userActiveIdentitySessions.sessionId, sessionId))
      .limit(1);

    return result[0] || null;
  }

  async updateSession(sessionId: string, data: Partial<typeof userActiveIdentitySessions.$inferInsert>) {
    const result = await this.db
      .update(userActiveIdentitySessions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(userActiveIdentitySessions.sessionId, sessionId))
      .returning();

    return result[0] || null;
  }

  async deleteSession(sessionId: string) {
    await this.db
      .delete(userActiveIdentitySessions)
      .where(eq(userActiveIdentitySessions.sessionId, sessionId));
  }

  async deleteExpiredSessions(now: Date = new Date()) {
    await this.db
      .delete(userActiveIdentitySessions)
      .where(lte(userActiveIdentitySessions.expiresAt, now));
  }

  async getIdentityCache(authUserId: string) {
    return this.db
      .select()
      .from(userIdentityCache)
      .where(eq(userIdentityCache.authUserId, authUserId));
  }

  async findIdentity(authUserId: string, identityType: string) {
    const result = await this.db
      .select()
      .from(userIdentityCache)
      .where(
        and(
          eq(userIdentityCache.authUserId, authUserId),
          eq(userIdentityCache.identityType, identityType)
        )
      )
      .limit(1);

    return result[0] || null;
  }

  async replaceIdentityCache(authUserId: string, identities: Array<{
    id: string;
    identityType: string;
    roleName: string;
    metadata?: Record<string, any>;
  }>) {
    await this.db
      .delete(userIdentityCache)
      .where(eq(userIdentityCache.authUserId, authUserId));

    if (identities.length === 0) {
      return;
    }

    await this.db
      .insert(userIdentityCache)
      .values(
        identities.map((identity) => ({
          id: identity.id,
          authUserId,
          identityType: identity.identityType,
          roleName: identity.roleName,
          metadata: identity.metadata || {},
          updatedAt: new Date(),
        }))
      );
  }
}
