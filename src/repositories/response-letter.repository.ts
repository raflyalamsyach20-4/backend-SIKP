import { eq, and, desc, asc, or, sql, like } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { responseLetters, submissions, teams, users, mahasiswa, teamMembers } from '@/db/schema';
import type { ResponseLetter, ResponseLetterWithDetails } from '@/types';
import { generateId } from '@/utils/helpers';

/**
 * Response Letter Repository
 * Handles all database operations for response letters
 */
export class ResponseLetterRepository {
  constructor(private db: DbClient) {}

  /**
   * Create a new response letter
   */
  async create(data: {
    submissionId: string;
    originalName?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    fileUrl?: string;
    memberUserId?: string;
    letterStatus: 'approved' | 'rejected';
  }): Promise<ResponseLetter> {
    const id = generateId();

    const [responseLetter] = await this.db
      .insert(responseLetters)
      .values({
        id,
        submissionId: data.submissionId,
        originalName: data.originalName || null,
        fileName: data.fileName || null,
        fileType: data.fileType || null,
        fileSize: data.fileSize || null,
        fileUrl: data.fileUrl || null,
        memberUserId: data.memberUserId || null,
        letterStatus: data.letterStatus,
        submittedAt: new Date(),
        verified: false,
      })
      .returning();

    return responseLetter as ResponseLetter;
  }

  /**
   * Find response letter by ID
   */
  async findById(id: string): Promise<ResponseLetter | null> {
    const [responseLetter] = await this.db
      .select()
      .from(responseLetters)
      .where(eq(responseLetters.id, id))
      .limit(1);

    return (responseLetter as ResponseLetter) || null;
  }

  /**
   * Find response letter by submission ID
   */
  async findBySubmissionId(submissionId: string): Promise<ResponseLetter | null> {
    const [responseLetter] = await this.db
      .select()
      .from(responseLetters)
      .where(eq(responseLetters.submissionId, submissionId))
      .limit(1);

    return (responseLetter as ResponseLetter) || null;
  }

  /**
   * Find response letter by team ID - DEPRECATED (teamId removed from response_letters table)
   * Use findBySubmissionId instead
   */
  async findByTeamId(teamId: string): Promise<ResponseLetter | null> {
    // This method is deprecated as teamId was removed from response_letters table
    // It can now only be accessed through the submission relationship
    return null;
  }

  /**
   * Get response letter with full details
   */
  async findByIdWithDetails(id: string): Promise<ResponseLetterWithDetails | null> {
    const result = await this.db
      .select({
        responseLetter: responseLetters,
        submission: submissions,
        team: teams,
        leader: users,
        leaderMahasiswa: mahasiswa,
      })
      .from(responseLetters)
      .leftJoin(submissions, eq(responseLetters.submissionId, submissions.id))
      .leftJoin(teams, eq(submissions.teamId, teams.id))
      .leftJoin(users, eq(teams.leaderId, users.id))
      .leftJoin(mahasiswa, eq(users.id, mahasiswa.id))
      .where(eq(responseLetters.id, id))
      .limit(1);

    if (!result || result.length === 0) {
      return null;
    }

    const data = result[0];

    // Get team members
    const teamId = data.team?.id;
    const membersData = teamId 
      ? await this.db
          .select({
            user: users,
            mahasiswaProfile: mahasiswa,
            member: teamMembers,
          })
          .from(teamMembers)
          .leftJoin(users, eq(teamMembers.userId, users.id))
          .leftJoin(mahasiswa, eq(users.id, mahasiswa.id))
          .where(eq(teamMembers.teamId, teamId))
      : [];

    return {
      ...data.responseLetter,
      submission: data.submission || undefined,
      team: data.team || undefined,
      leader: data.leader
        ? {
            ...data.leader,
            mahasiswaProfile: data.leaderMahasiswa || undefined,
          }
        : undefined,
      members: membersData.map((m) => ({
        ...m.user,
        mahasiswaProfile: m.mahasiswaProfile || undefined,
        role: m.member.role || 'ANGGOTA',
      })),
    } as ResponseLetterWithDetails;
  }

  /**
   * Get all response letters with filters
   */
  async findAll(filters?: {
    status?: 'all' | 'approved' | 'rejected' | 'verified' | 'unverified';
    sort?: 'date' | 'name';
    limit?: number;
    offset?: number;
  }): Promise<ResponseLetterWithDetails[]> {
    let query = this.db
      .select({
        responseLetter: responseLetters,
        submission: submissions,
        team: teams,
        leader: users,
        leaderMahasiswa: mahasiswa,
      })
      .from(responseLetters)
      .leftJoin(submissions, eq(responseLetters.submissionId, submissions.id))
      .leftJoin(teams, eq(submissions.teamId, teams.id))
      .leftJoin(users, eq(teams.leaderId, users.id))
      .leftJoin(mahasiswa, eq(users.id, mahasiswa.id));

    // Apply filters
    const conditions = [];

    if (filters?.status && filters.status !== 'all') {
      if (filters.status === 'verified') {
        conditions.push(eq(responseLetters.verified, true));
      } else if (filters.status === 'unverified') {
        conditions.push(eq(responseLetters.verified, false));
      } else if (filters.status === 'approved') {
        conditions.push(eq(responseLetters.letterStatus, 'approved'));
      } else if (filters.status === 'rejected') {
        conditions.push(eq(responseLetters.letterStatus, 'rejected'));
      }
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    // Apply sorting
    if (filters?.sort === 'name') {
      query = query.orderBy(asc(users.nama)) as any;
    } else {
      query = query.orderBy(desc(responseLetters.submittedAt)) as any;
    }

    // Apply pagination
    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    const results = await query;

    // Get team members for each response letter
    const responseLettersWithDetails = await Promise.all(
      results.map(async (data) => {
        const teamId = data.team?.id;
        const membersData = teamId
          ? await this.db
              .select({
                user: users,
                mahasiswaProfile: mahasiswa,
                member: teamMembers,
              })
              .from(teamMembers)
              .leftJoin(users, eq(teamMembers.userId, users.id))
              .leftJoin(mahasiswa, eq(users.id, mahasiswa.id))
              .where(eq(teamMembers.teamId, teamId))
          : [];

        return {
          ...data.responseLetter,
          submission: data.submission || undefined,
          team: data.team || undefined,
          leader: data.leader
            ? {
                ...data.leader,
                mahasiswaProfile: data.leaderMahasiswa || undefined,
              }
            : undefined,
          members: membersData.map((m) => ({
            ...m.user,
            mahasiswaProfile: m.mahasiswaProfile || undefined,
            role: m.member.role || 'ANGGOTA',
          })),
        } as ResponseLetterWithDetails;
      })
    );

    return responseLettersWithDetails;
  }

  /**
   * Update response letter verification status
   */
  async verify(
    id: string,
    adminId: string
  ): Promise<ResponseLetter> {
    const [updated] = await this.db
      .update(responseLetters)
      .set({
        verified: true,
        verifiedAt: new Date(),
        verifiedByAdminId: adminId,
      })
      .where(eq(responseLetters.id, id))
      .returning();

    return updated as ResponseLetter;
  }

  /**
   * Update response letter
   */
  async update(
    id: string,
    data: Partial<{
      originalName: string;
      fileName: string;
      fileType: string;
      fileSize: number;
      fileUrl: string;
      memberUserId: string;
      letterStatus: 'approved' | 'rejected';
    }>
  ): Promise<ResponseLetter> {
    const [updated] = await this.db
      .update(responseLetters)
      .set(data)
      .where(eq(responseLetters.id, id))
      .returning();

    return updated as ResponseLetter;
  }

  /**
   * Delete response letter
   */
  async delete(id: string): Promise<void> {
    await this.db.delete(responseLetters).where(eq(responseLetters.id, id));
  }

  /**
   * Check if user is member of team
   */
  async isUserMemberOfTeam(userId: string, teamId: string): Promise<boolean> {
    const [member] = await this.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId)))
      .limit(1);

    return !!member;
  }
}
