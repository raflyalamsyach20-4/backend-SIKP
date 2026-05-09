import { eq, lte, sql } from 'drizzle-orm';
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

  async findProfileSnapshotByMahasiswaId(mahasiswaId: string) {
    // 1. First try direct column match (fastest)
    const direct = await this.db.select().from(authSessions).where(eq(authSessions.authUserId, mahasiswaId)).limit(1);
    if (direct.length > 0) return direct[0].profileSnapshot as any;

    // 2. Fetch all sessions (usually very few) and search in snapshot data
    const allSessions = await this.db.select().from(authSessions);
    for (const session of allSessions) {
      const snapshot = session.profileSnapshot as any;
      if (!snapshot) continue;

      // Check root ID
      if (snapshot.id === mahasiswaId || snapshot.authUserId === mahasiswaId) return snapshot;

      // Check identities
      const ids = snapshot.identities;
      if (Array.isArray(ids)) {
        if (ids.some((i: any) => i.id === mahasiswaId)) return snapshot;
      } else if (ids) {
        if (ids.mahasiswa?.id === mahasiswaId || ids.dosen?.id === mahasiswaId) return snapshot;
      }
    }

    return null;
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
    metadata?: Record<string, unknown>;
  }>) {
    void authUserId;
    void identities;
  }
}
