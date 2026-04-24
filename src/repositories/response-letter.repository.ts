import { eq, and, desc, asc } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { responseLetters, submissions, teams, teamMembers } from '@/db/schema';
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
    studentName?: string | null;
    studentNim?: string | null;
    companyName?: string | null;
    supervisorName?: string | null;
    memberCount?: number | null;
    roleLabel?: string | null;
    membersSnapshot?: Array<{ id: number | string; name: string; nim: string; prodi?: string; role?: string }> | null;
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
        studentName: data.studentName ?? null,
        studentNim: data.studentNim ?? null,
        companyName: data.companyName ?? null,
        supervisorName: data.supervisorName ?? null,
        memberCount: data.memberCount ?? null,
        roleLabel: data.roleLabel ?? null,
        membersSnapshot: data.membersSnapshot ?? null,
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
   * Find response letter by user ID (memberUserId)
   * Returns the most recent response letter for the user
   */
  async findByUserId(userId: string): Promise<ResponseLetter | null> {
    const [responseLetter] = await this.db
      .select()
      .from(responseLetters)
      .where(eq(responseLetters.memberUserId, userId))
      .orderBy(desc(responseLetters.submittedAt))
      .limit(1);

    return (responseLetter as ResponseLetter) || null;
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
      })
      .from(responseLetters)
      .leftJoin(submissions, eq(responseLetters.submissionId, submissions.id))
      .leftJoin(teams, eq(submissions.teamId, teams.id))
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
            member: teamMembers,
          })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, teamId))
      : [];

    return {
      ...data.responseLetter,
      submission: undefined,
      team: data.team || undefined,
      leader: undefined,
      members: membersData.map((m) => ({
        id: m.member.userId,
        nama: null,
        email: '',
        password: '',
        phone: null,
        role: 'MAHASISWA',
        isActive: true,
        mahasiswaProfile: undefined,
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
    const whereCondition =
      filters?.status === 'verified'
        ? eq(responseLetters.verified, true)
        : filters?.status === 'unverified'
          ? eq(responseLetters.verified, false)
          : filters?.status === 'approved'
            ? eq(responseLetters.letterStatus, 'approved')
            : filters?.status === 'rejected'
              ? eq(responseLetters.letterStatus, 'rejected')
              : undefined;

    const baseQuery = this.db
      .select({
        responseLetter: responseLetters,
        submission: submissions,
        team: teams,
      })
      .from(responseLetters)
      .leftJoin(submissions, eq(responseLetters.submissionId, submissions.id))
      .leftJoin(teams, eq(submissions.teamId, teams.id));

    const filteredQuery = whereCondition ? baseQuery.where(and(whereCondition)) : baseQuery;
    const sortedQuery =
      filters?.sort === 'name'
        ? filteredQuery.orderBy(asc(responseLetters.studentName))
        : filteredQuery.orderBy(desc(responseLetters.submittedAt));
    const limitedQuery = filters?.limit ? sortedQuery.limit(filters.limit) : sortedQuery;
    const finalQuery = filters?.offset ? limitedQuery.offset(filters.offset) : limitedQuery;

    const results = await finalQuery;

    // Get team members for each response letter
    const responseLettersWithDetails = await Promise.all(
      results.map(async (data) => {
        const teamId = data.team?.id;
        const membersData = teamId
          ? await this.db
              .select({
                member: teamMembers,
              })
              .from(teamMembers)
              .where(eq(teamMembers.teamId, teamId))
          : [];

        return {
          ...data.responseLetter,
          submission: undefined,
          team: data.team || undefined,
          leader: undefined,
          members: membersData.map((m) => ({
            id: m.member.userId,
            nama: null,
            email: '',
            password: '',
            phone: null,
            role: 'MAHASISWA',
            isActive: true,
            mahasiswaProfile: undefined,
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
      submissionId: string | null;
      studentName: string | null;
      studentNim: string | null;
      companyName: string | null;
      supervisorName: string | null;
      memberCount: number | null;
      roleLabel: string | null;
      membersSnapshot?: Array<{ id: number | string; name: string; nim: string; prodi?: string; role?: string }> | null;
    }>
  ): Promise<ResponseLetter> {
    const [updated] = await this.db
      .update(responseLetters)
      .set(data)
      .where(eq(responseLetters.id, id))
      .returning();

    return updated as ResponseLetter;
  }

  async countApproved() {
    const result = await this.db
      .select()
      .from(responseLetters)
      .where(eq(responseLetters.letterStatus, 'approved'));

    return result.length;
  }

  async countApprovedAndVerified() {
    const result = await this.db
      .select()
      .from(responseLetters)
      .where(
        and(
          eq(responseLetters.letterStatus, 'approved'),
          eq(responseLetters.verified, true)
        )
      );

    return result.length;
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

  /**
   * Find response letter for user's team with details and isLeader flag
   * This is used by the getMyResponseLetter endpoint
   */
  async findByUserTeamWithDetails(
    userId: string
  ): Promise<(ResponseLetterWithDetails & { isLeader: boolean }) | null> {
    // 1. Get user's team (only accepted members)
    const teamMembersResult = await this.db
      .select({
        member: teamMembers,
        team: teams,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.invitationStatus, 'ACCEPTED')
      ))
      .limit(1);

    if (!teamMembersResult || teamMembersResult.length === 0) {
      return null;
    }

    const userTeamMember = teamMembersResult[0];
    const teamId = userTeamMember.team.id;
    const isLeader = userTeamMember.member.role === 'KETUA';

    // 2. Get the most recent submission for this team
    const submissionsResult = await this.db
      .select()
      .from(submissions)
      .where(eq(submissions.teamId, teamId))
      .orderBy(desc(submissions.createdAt))
      .limit(1);

    if (!submissionsResult || submissionsResult.length === 0) {
      return null;
    }

    const submission = submissionsResult[0];

    // 3. Get response letter with full details
    const responseLettersResult = await this.db
      .select({
        responseLetter: responseLetters,
        submission: submissions,
        team: teams,
      })
      .from(responseLetters)
      .innerJoin(submissions, eq(responseLetters.submissionId, submissions.id))
      .innerJoin(teams, eq(submissions.teamId, teams.id))
      .where(eq(responseLetters.submissionId, submission.id))
      .limit(1);

    if (!responseLettersResult || responseLettersResult.length === 0) {
      return null;
    }

    const data = responseLettersResult[0];

    // 4. Get team members with details
    const membersResult = await this.db
      .select({
        member: teamMembers,
      })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));

    return {
      ...data.responseLetter,
      submission: undefined,
      team: data.team || undefined,
      leader: undefined,
      members: membersResult.map((m) => ({
        id: m.member.userId,
        nama: null,
        email: '',
        password: '',
        phone: null,
        role: 'MAHASISWA',
        isActive: true,
        mahasiswaProfile: undefined,
      })),
      isLeader,
    } as ResponseLetterWithDetails & { isLeader: boolean };
  }
}
