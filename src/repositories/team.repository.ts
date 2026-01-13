import { eq, and } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { teams, teamMembers } from '@/db/schema';

export class TeamRepository {
  constructor(private db: DbClient) {}

  async findById(id: string) {
    const result = await this.db.select().from(teams).where(eq(teams.id, id)).limit(1);
    return result[0] || null;
  }

  async findByLeaderId(leaderId: string) {
    return await this.db.select().from(teams).where(eq(teams.leaderId, leaderId));
  }

  async create(data: typeof teams.$inferInsert) {
    const result = await this.db.insert(teams).values(data).returning();
    return result[0];
  }

  async update(id: string, data: Partial<typeof teams.$inferInsert>) {
    const result = await this.db
      .update(teams)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teams.id, id))
      .returning();
    return result[0];
  }

  async addMember(data: typeof teamMembers.$inferInsert) {
    const result = await this.db.insert(teamMembers).values(data).returning();
    return result[0];
  }

  async findMembersByTeamId(teamId: string) {
    return await this.db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
  }

  async findMemberByTeamAndUser(teamId: string, userId: string) {
    const result = await this.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);
    return result[0] || null;
  }

  async updateMemberStatus(id: string, status: 'PENDING' | 'ACCEPTED' | 'REJECTED', respondedAt?: Date) {
    const result = await this.db
      .update(teamMembers)
      .set({ invitationStatus: status, respondedAt: respondedAt || new Date(), updatedAt: new Date() })
      .where(eq(teamMembers.id, id))
      .returning();
    return result[0];
  }
}
