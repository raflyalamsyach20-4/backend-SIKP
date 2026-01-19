import { eq, and } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { teams, teamMembers, submissions } from '@/db/schema';

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
      .set(data)  // ✅ Don't set updatedAt, teams table doesn't have it
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
      .set({ invitationStatus: status, respondedAt: respondedAt || new Date() })  // ✅ Don't set updatedAt
      .where(eq(teamMembers.id, id))
      .returning();
    return result[0];
  }

  async findMembershipByUserId(userId: string) {
    return await this.db.select().from(teamMembers).where(eq(teamMembers.userId, userId));
  }

  async deleteTeam(id: string) {
    const result = await this.db.delete(teams).where(eq(teams.id, id)).returning();
    return result[0] || null;
  }

  async hasSubmissions(teamId: string): Promise<boolean> {
    const result = await this.db.select().from(submissions).where(eq(submissions.teamId, teamId)).limit(1);
    return !!result[0];
  }

  async getPendingInvitations(userId: string) {
    // ✅ Return ALL invitations (not just PENDING), let frontend filter
    return await this.db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));
  }

  // ✅ NEW: Find a specific member record with explicit ownership verification
  async findMemberById(memberId: string, userId: string) {
    const result = await this.db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.id, memberId),
          eq(teamMembers.userId, userId)  // ✅ Explicit ownership check
        )
      )
      .limit(1);
    return result[0] || null;
  }

  // ✅ NEW: Get all teams where user is an ACCEPTED member (not just leader)
  async findTeamsByMemberId(userId: string) {
    // Get team IDs where user is ACCEPTED member
    const memberRecords = await this.db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.invitationStatus, 'ACCEPTED')
        )
      );

    if (memberRecords.length === 0) {
      return [];
    }

    // Get the actual team records
    const teamIds = memberRecords.map(m => m.teamId);
    const teamsList = await Promise.all(
      teamIds.map(teamId => this.findById(teamId))
    );

    return teamsList.filter(team => team !== null);
  }
}
