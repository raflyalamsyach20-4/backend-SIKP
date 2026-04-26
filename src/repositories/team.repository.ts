import { eq, and, inArray } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { teams, teamMembers, submissions } from '@/db/schema';

export class TeamRepository {
  constructor(private db: DbClient) {}

  async findById(id: string) {
    const result = await this.db.select().from(teams).where(eq(teams.id, id)).limit(1);
    return result[0] || null;
  }

  async findByCode(code: string) {
    const result = await this.db.select().from(teams).where(eq(teams.code, code)).limit(1);
    return result[0] || null;
  }

  async findByLeaderMahasiswaId(leaderMahasiswaId: string) {
    return await this.db.select().from(teams).where(eq(teams.leaderMahasiswaId, leaderMahasiswaId));
  }

  async findByDosenKpId(dosenKpId: string) {
    return await this.db.select().from(teams).where(eq(teams.dosenKpId, dosenKpId));
  }

  async countFixedTeams() {
    const result = await this.db.select().from(teams).where(eq(teams.status, 'FIXED'));
    return result.length;
  }

  async countDistinctDosenKpInFixedTeams() {
    const fixedTeams = await this.db.select().from(teams).where(eq(teams.status, 'FIXED'));
    const uniqueDosen = new Set<string>();

    fixedTeams.forEach((team) => {
      if (team.dosenKpId) {
        uniqueDosen.add(team.dosenKpId);
      }
    });

    return uniqueDosen.size;
  }

  async create(data: typeof teams.$inferInsert) {
    const result = await this.db.insert(teams).values(data).returning();
    return result[0];
  }

  async update(id: string, data: Partial<typeof teams.$inferInsert>) {
    const result = await this.db
      .update(teams)
      .set(data)
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

  /**
   * Get team members with user data (for displaying member info)
   */
  async findMembersWithUserDataByTeamId(teamId: string) {
    const members = await this.db
      .select({
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        mahasiswaId: teamMembers.mahasiswaId,
        role: teamMembers.role,
        invitationStatus: teamMembers.invitationStatus,
      })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));

    return members.map((member) => ({
      ...member,
      user: {
        id: member.mahasiswaId,
        nama: null,
        email: null,
        phone: null,
        nim: null,
        prodi: null,
        angkatan: null,
        semester: null,
      },
    }));
  }

  async findMemberByTeamAndMahasiswa(teamId: string, mahasiswaId: string) {
    const result = await this.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.mahasiswaId, mahasiswaId)))
      .limit(1);
    return result[0] || null;
  }

  async findMemberByIdOnly(memberId: string) {
    const result = await this.db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.id, memberId))
      .limit(1);
    return result[0] || null;
  }

  async removeMember(memberId: string) {
    const result = await this.db
      .delete(teamMembers)
      .where(eq(teamMembers.id, memberId))
      .returning();
    return result[0] || null;
  }

  async updateMemberStatus(id: string, status: 'PENDING' | 'ACCEPTED' | 'REJECTED', respondedAt?: Date) {
    const result = await this.db
      .update(teamMembers)
      .set({ invitationStatus: status, respondedAt: respondedAt || new Date() })
      .where(eq(teamMembers.id, id))
      .returning();
    return result[0];
  }

  async findMembershipByMahasiswaId(mahasiswaId: string) {
    return await this.db.select().from(teamMembers).where(eq(teamMembers.mahasiswaId, mahasiswaId));
  }

  async findAcceptedMembersByTeamIds(teamIds: string[]) {
    if (teamIds.length === 0) return [];
    return await this.db
      .select({
        teamId: teamMembers.teamId,
        mahasiswaId: teamMembers.mahasiswaId,
      })
      .from(teamMembers)
      .where(
        and(
          inArray(teamMembers.teamId, teamIds),
          eq(teamMembers.invitationStatus, 'ACCEPTED')
        )
      );
  }

  async deleteTeam(id: string) {
    const result = await this.db.delete(teams).where(eq(teams.id, id)).returning();
    return result[0] || null;
  }

  async hasSubmissions(teamId: string): Promise<boolean> {
    const result = await this.db.select().from(submissions).where(eq(submissions.teamId, teamId)).limit(1);
    return !!result[0];
  }

  async findInvitationsByMahasiswaId(mahasiswaId: string) {
    return await this.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.mahasiswaId, mahasiswaId), eq(teamMembers.invitationStatus, 'PENDING')));
  }

  async findTeamsByMahasiswaId(mahasiswaId: string) {
    const memberRecords = await this.db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.mahasiswaId, mahasiswaId),
          eq(teamMembers.invitationStatus, 'ACCEPTED')
        )
      );

    if (memberRecords.length === 0) return [];
    const teamIds = memberRecords.map(m => m.teamId);
    const teamsList = await Promise.all(teamIds.map(teamId => this.findById(teamId)));
    return teamsList.filter(team => team !== null);
  }
}
