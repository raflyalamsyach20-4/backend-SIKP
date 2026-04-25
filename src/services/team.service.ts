import { createDbClient } from '@/db';
import { TeamRepository } from '@/repositories/team.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { ResponseLetterRepository } from '@/repositories/response-letter.repository';
import { DosenService } from './dosen.service';
import { MahasiswaService } from './mahasiswa.service';
import { generateId, generateTeamCode } from '@/utils/helpers';

export class TeamService {
  private teamRepo: TeamRepository;
  private submissionRepo: SubmissionRepository;
  private responseLetterRepo: ResponseLetterRepository;
  
  private _dosenService?: DosenService;
  private _mahasiswaService?: MahasiswaService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.teamRepo = new TeamRepository(db);
    this.submissionRepo = new SubmissionRepository(db);
    this.responseLetterRepo = new ResponseLetterRepository(db);
  }

  private get dosenService(): DosenService {
    if (!this._dosenService) {
      this._dosenService = new DosenService(this.env);
    }
    return this._dosenService;
  }

  private get mahasiswaService(): MahasiswaService {
    if (!this._mahasiswaService) {
      this._mahasiswaService = new MahasiswaService(this.env);
    }
    return this._mahasiswaService;
  }

  private buildDefaultDraftPayload(teamCode: string) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    return {
      letterPurpose: `Belum diisi`,
      companyName: 'Belum diisi',
      companyAddress: 'Belum diisi',
      companyPhone: null,
      companyBusinessType: null,
      division: 'Belum diisi',
      startDate: today,
      endDate: today,
    };
  }

  async createTeam(mahasiswaId: string, dosenPAId: string | null | undefined) {
    console.log(`[createTeam] 🚀 Starting team creation for mahasiswaId=${mahasiswaId}, dosenPAId=${dosenPAId}`);
    
    try {
      // ✅ Validate dosenPAId exists (required from SSO)
      if (!dosenPAId) {
        console.error(`[createTeam] ❌ Missing dosenPAId for mahasiswaId=${mahasiswaId}`);
        const err = new Error('Dosen PA tidak ditemukan. Hubungi administrator untuk mengatur dosen PA.') as Error & {
          statusCode?: number;
        };
        err.statusCode = 400;
        throw err;
      }

      // Check if mahasiswaId already has a team (as leader)
      const existingTeamsAsLeader = await this.teamRepo.findByLeaderMahasiswaId(mahasiswaId);
      if (existingTeamsAsLeader.length > 0) {
        console.error(`[createTeam] ❌ mahasiswaId already has ${existingTeamsAsLeader.length} team(s)`);
        throw new Error('You already have a team. Each student can only create one team');
      }

      // Check if mahasiswaId is already a member of another team (ACCEPTED status)
      const existingMemberships = await this.teamRepo.findMembershipByMahasiswaId(mahasiswaId);
      const acceptedMembership = existingMemberships.find(m => m.invitationStatus === 'ACCEPTED');
      if (acceptedMembership) {
        console.error(`[createTeam] ❌ mahasiswaId already member of team: ${acceptedMembership.teamId}`);
        throw new Error('You are already a member of another team. Each student can only join one team');
      }

      console.log(`[createTeam] ✅ Validation passed, creating team...`);

      // ✅ Use dosenPAId from SSO profile directly (no need for local DB lookup)
      const dosenKpId = dosenPAId;
      console.log(`[createTeam] ✅ Using dosenKpId from SSO: ${dosenKpId}`);

      // Create team with auto-generated code
      const team = await this.teamRepo.create({
        id: generateId(),
        code: generateTeamCode(),
        leaderMahasiswaId: mahasiswaId,
        dosenKpId,
        status: 'PENDING',
      });

      console.log(`[createTeam] ✅ Team created: ${team.id} (${team.code})`);

      // Add leader as member with ACCEPTED status
      try {
        await this.teamRepo.addMember({
          id: generateId(),
          teamId: team.id,
          mahasiswaId: mahasiswaId,
          role: 'KETUA',
          invitationStatus: 'ACCEPTED',
          invitedAt: new Date(),
          invitedByMahasiswaId: mahasiswaId,
          respondedAt: new Date(),
        });
        
        console.log(`[createTeam] ✅ Leader added as member successfully`);
      } catch (memberError: unknown) {
        console.error(`[createTeam] ❌ Failed to add leader as member:`, memberError);
        
        // Rollback: Delete the team if adding member fails
        try {
          await this.teamRepo.deleteTeam(team.id);
          console.log(`[createTeam] 🔄 Team rolled back: ${team.id}`);
        } catch (rollbackError) {
          console.error(`[createTeam] ⚠️ Rollback failed:`, rollbackError);
        }
        
        throw new Error(
          `Failed to add leader to team: ${memberError instanceof Error ? memberError.message : 'Unknown error'}`
        );
      }

      console.log(`[createTeam] ✅ Team creation completed: ${team.code}`);
      return team;
      
    } catch (error) {
      console.error(`[createTeam] ❌ Error creating team:`, error);
      
      // Re-throw with proper error message
      throw new Error(
        error instanceof Error 
          ? error.message 
          : 'Failed to create team'
      );
    }
  }

  async leaveTeam(teamId: string, mahasiswaId: string) {
    console.log(`[leaveTeam] Processing leave: teamId=${teamId}, mahasiswaId=${mahasiswaId}`);
    
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      console.error(`[leaveTeam] ❌ Team not found: ${teamId}`);
      throw new Error('Team not found');
    }

    // Prevent leader from leaving using this endpoint
    if (team.leaderMahasiswaId === mahasiswaId) {
      console.error(`[leaveTeam] ❌ Leader cannot leave team, must delete instead: ${teamId}`);
      const err: Error = new Error('Team leader cannot leave the team. Please delete the team instead.');
      err.statusCode = 403;
      throw err;
    }

    // Find member record
    const member = await this.teamRepo.findMemberByTeamAndMahasiswa(teamId, mahasiswaId);
    if (!member) {
      console.error(`[leaveTeam] ❌ Member not found: mahasiswaId=${mahasiswaId}, teamId=${teamId}`);
      throw new Error('You are not a member of this team');
    }

    // Delete member record
    console.log(`[leaveTeam] Removing member: ${member.id}`);
    const deletedMember = await this.teamRepo.removeMember(member.id);
    console.log(`[leaveTeam] ✅ Member removed successfully:`, deletedMember);
    
    // Verify deletion
    const verifyMember = await this.teamRepo.findMemberByTeamAndMahasiswa(teamId, mahasiswaId);
    if (verifyMember) {
      console.error(`[leaveTeam] ⚠️ VERIFICATION FAILED: Member still exists after deletion!`);
      throw new Error('Failed to remove member from team - please try again');
    }
    console.log(`[leaveTeam] ✅ VERIFICATION: Member successfully deleted from database`);

    return {
      success: true,
      message: 'Successfully left the team',
      teamId,
    };
  }

  async removeMember(teamId: string, memberId: string, mahasiswaId: string) {
    console.log(`[removeMember] Processing removal: teamId=${teamId}, memberId=${memberId}, mahasiswaId=${mahasiswaId}`);
    
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      console.error(`[removeMember] ❌ Team not found: ${teamId}`);
      throw new Error('Team not found');
    }

    // Only leader can remove members
    if (team.leaderMahasiswaId !== mahasiswaId) {
      console.error(`[removeMember] ❌ Unauthorized: User ${mahasiswaId} is not leader of team ${teamId}`);
      const err: Error = new Error('Only team leader can remove members');
      err.statusCode = 403;
      throw err;
    }

    // ✅ Prevent removing members from FIXED teams
    if (team.status === 'FIXED') {
      console.error(`[removeMember] ❌ Cannot remove member from finalized team: ${teamId}`);
      const err: Error = new Error('Cannot remove members from a finalized team');
      err.statusCode = 400;
      throw err;
    }

    // Get all members of this team to find the one by memberId
    const allMembers = await this.teamRepo.findMembersByTeamId(teamId);
    const member = allMembers.find(m => m.id === memberId);
    
    if (!member) {
      console.error(`[removeMember] ❌ Member not found: ${memberId}`);
      throw new Error('Member not found in this team');
    }

    // Cannot remove the leader
    if (member.role === 'KETUA' || member.mahasiswaId === team.leaderMahasiswaId) {
      console.error(`[removeMember] ❌ Cannot remove team leader: ${memberId}`);
      const err: Error = new Error('Cannot remove team leader');
      err.statusCode = 400;
      throw err;
    }

    // Delete member record
    console.log(`[removeMember] Removing member: ${member.id}`);
    const deletedMember = await this.teamRepo.removeMember(member.id);
    console.log(`[removeMember] ✅ Member removed successfully:`, deletedMember);
    
    // Verify deletion
    const allMembersAfter = await this.teamRepo.findMembersByTeamId(teamId);
    const verifyMember = allMembersAfter.find(m => m.id === memberId);
    if (verifyMember) {
      console.error(`[removeMember] ⚠️ VERIFICATION FAILED: Member still exists after deletion!`);
      throw new Error('Failed to remove member from team - please try again');
    }
    console.log(`[removeMember] ✅ VERIFICATION: Member successfully deleted from database`);

    return {
      success: true,
      message: 'Member removed successfully',
      removedMahasiswaId: member.mahasiswaId,
      teamId,
    };
  }

  async deleteTeam(teamId: string, mahasiswaId: string) {
    console.log(`[deleteTeam] Processing deletion: teamId=${teamId}, mahasiswaId=${mahasiswaId}`);
    
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      console.error(`[deleteTeam] ❌ Team not found: ${teamId}`);
      throw new Error('Team not found');
    }

    if (team.leaderMahasiswaId !== mahasiswaId) {
      console.error(`[deleteTeam] ❌ Unauthorized: User ${mahasiswaId} is not leader of team ${teamId}`);
      const err: Error = new Error('Only team leader can delete the team');
      err.statusCode = 403;
      throw err;
    }

    // Business rule: FIXED team can only be deleted after a response letter is submitted.
    if (team.status === 'FIXED') {
      const allSubmissions = await this.submissionRepo.findAllByTeamId(teamId);
      const responseLetters = await Promise.all(
        allSubmissions.map((submission) =>
          this.responseLetterRepo.findBySubmissionId(submission.id)
        )
      );
      const hasSubmittedResponseLetter = responseLetters.some(
        (responseLetter) => !!responseLetter
      );

      if (!hasSubmittedResponseLetter) {
        const err: Error = new Error(
          'Tim berstatus FIXED tidak dapat dibubarkan sebelum mengirim surat balasan.'
        );
        err.statusCode = 400;
        throw err;
      }
    }

    // Count members affected before deletion
    const members = await this.teamRepo.findMembersByTeamId(teamId);
    const membersAffected = members.length;
    console.log(`[deleteTeam] Found ${membersAffected} members to be affected`);

    // Delete team (team_members will cascade delete)
    console.log(`[deleteTeam] Deleting team and cascade deleting team_members...`);
    const deleted = await this.teamRepo.deleteTeam(teamId);
    console.log(`[deleteTeam] ✅ Team deleted successfully`);

    return {
      deletedTeamId: deleted?.id || teamId,
      deletedTeamCode: deleted?.code || team.code,
      membersAffected,
    };
  }

  async finalizeTeam(teamId: string, mahasiswaId: string) {
    console.log(`[finalizeTeam] Processing finalization: teamId=${teamId}, mahasiswaId=${mahasiswaId}`);
    
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      console.error(`[finalizeTeam] ❌ Team not found: ${teamId}`);
      throw new Error('Team not found');
    }

    // 1. Authorization: User must be team leader
    if (team.leaderMahasiswaId !== mahasiswaId) {
      console.error(`[finalizeTeam] ❌ Unauthorized: User ${mahasiswaId} is not leader of team ${teamId}`);
      const err: Error = new Error('Hanya ketua tim yang dapat finalisasi tim');
      err.statusCode = 403;
      throw err;
    }

    // 2. Check if team is already FIXED (idempotent path)
    const alreadyFixed = team.status === 'FIXED';
    if (alreadyFixed) {
      console.warn(`[finalizeTeam] ⚠️ Team already finalized, continue idempotently: ${teamId}`);
    }

    // 3. Get all members (validation removed - team can be finalized with just the leader)
    const members = await this.teamRepo.findMembersByTeamId(teamId);
    const acceptedMembers = members.filter(m => 
      m.invitationStatus === 'ACCEPTED' && m.role !== 'KETUA'
    );
    
    console.log(`[finalizeTeam] Team has ${members.length} total members, ${acceptedMembers.length} accepted (excluding leader)`);
    console.log(`[finalizeTeam] Allowing finalization even with just the leader`);

    // 4. ✅ Verify team has dosenKpId (should be set during creation from SSO profile)
    if (!team.dosenKpId) {
      console.error(`[finalizeTeam] ❌ Team missing dosenKpId (should have been set during creation)`);
      const err: Error = new Error('Dosen PA ketua belum ditetapkan. Hubungi administrator.');
      err.statusCode = 422;
      throw err;
    }

    // 5. Update team status to FIXED (dosenKpId already correct from creation)
    let updatedTeam = team;
    if (!alreadyFixed) {
      console.log(`[finalizeTeam] Updating team status to FIXED with existing dosenKpId...`);
      updatedTeam = await this.teamRepo.update(teamId, {
        status: 'FIXED',
      });
      console.log('[finalizeTeam] TEAM_FINALIZED', { teamId, dosenKpId: team.dosenKpId });
    }

    // 6. Ensure submission draft exists (idempotent)
    const existingSubmissions = await this.submissionRepo.findByTeamId(teamId);
    let submission = existingSubmissions[0] || null;
    let submissionAlreadyExists = !!submission;

    if (!submission) {
      const defaults = this.buildDefaultDraftPayload(updatedTeam?.code || team.code);
      let createdByThisRequest = true;
      try {
        submission = await this.submissionRepo.create({
          id: generateId(),
          teamId,
          status: 'DRAFT',
          ...defaults,
        });
      } catch {
        const racedSubmissions = await this.submissionRepo.findByTeamId(teamId);
        submission = racedSubmissions[0] || null;
        createdByThisRequest = false;
      }

      if (!submission) {
        throw new Error('Failed to create draft submission after team finalization');
      }

      submissionAlreadyExists = !createdByThisRequest;
      if (createdByThisRequest) {
        console.log('[finalizeTeam] SUBMISSION_CREATED', { teamId, submissionId: submission.id });
      } else {
        console.log('[finalizeTeam] SUBMISSION_CREATE_IDEMPOTENT_HIT', {
          teamId,
          submissionId: submission.id,
          });
      }
    } else {
      console.log('[finalizeTeam] SUBMISSION_CREATE_IDEMPOTENT_HIT', {
        teamId,
        submissionId: submission.id,
      });
    }

    return {
      id: updatedTeam?.id,
      code: updatedTeam?.code,
      status: updatedTeam?.status,
      message: 'Tim berhasil difinalisasi dan siap untuk pengajuan',
      submission,
      submissionAlreadyExists,
    };
  }

  async inviteMember(teamId: string, mahasiswaId: string, memberNim: string, sessionId: string) {
    // Verify team exists and user is leader
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.leaderMahasiswaId !== mahasiswaId) {
      throw new Error('Only team leader can invite members');
    }

    // ✅ Prevent inviting to FIXED teams
    if (team.status === 'FIXED') {
      throw new Error('Cannot invite members to a finalized team. Please create a new team if you want to add more members.');
    }

    // Find member by NIM from SSO
    console.log(`[inviteMember] 🔍 Looking up student by NIM: ${memberNim}`);
    const member = await this.mahasiswaService.getMahasiswaByNim(memberNim, sessionId);
    if (!member) {
      throw new Error(`Mahasiswa dengan NIM ${memberNim} tidak ditemukan di SSO`);
    }

    // Check if member already has THIS team
    const existingMember = await this.teamRepo.findMemberByTeamAndMahasiswa(teamId, member.id);
    if (existingMember) {
      const status = existingMember.invitationStatus;

      if (status === 'PENDING') {
        throw new Error('User already has a pending invitation to this team');
      }

      if (status === 'ACCEPTED') {
        throw new Error('User is already a member of this team');
      }

      if (status === 'REJECTED') {
        // Allow re-invite after rejection by removing the old record
        console.log(`[inviteMember] 🗑️ Removing old REJECTED invitation: memberId=${existingMember.id}`);
        await this.teamRepo.removeMember(existingMember.id);
      }
    }

    // ✅ Allow inviting users who already have other teams
    // Their old team will be auto-deleted when they accept the invitation

    // ✅ CRITICAL FIX: Add invitation with invitedBy field
    console.log(`[inviteMember] Creating invitation: teamId=${teamId}, mahasiswaId=${member.id}, invitedBy=${mahasiswaId}`);
    const invitation = await this.teamRepo.addMember({
      id: generateId(),
      teamId,
      mahasiswaId: member.id, // Identity ID from SSO
      role: 'ANGGOTA', // ✅ Set role to ANGGOTA for invited members
      invitationStatus: 'PENDING',
      invitedByMahasiswaId: mahasiswaId,  // ✅ CRITICAL: Set who invited this user
    });

    console.log(`[inviteMember] ✅ Invitation created: ${invitation.id}`);
    return invitation;
  }

  async respondToInvitation(memberId: string, mahasiswaId: string, accept: boolean) {
    console.log(`[respondToInvitation] 🔍 Processing: memberId=${memberId}, mahasiswaId=${mahasiswaId}, accept=${accept}`);
    
    // Step 1: Find the member record (without mahasiswaId filter - to support team leader responding)
    const memberRecord = await this.teamRepo.findMemberByIdOnly(memberId);
    
    if (!memberRecord) {
      console.error(`[respondToInvitation] ❌ Member record not found: memberId=${memberId}`);
      const notFoundError: Error = new Error('Invitation not found or already responded');
      notFoundError.statusCode = 404;
      throw notFoundError;
    }
    
    console.log(`[respondToInvitation] ✅ Found member record:`, {
      id: memberRecord.id,
      mahasiswaId: memberRecord.mahasiswaId,
      teamId: memberRecord.teamId,
      status: memberRecord.invitationStatus
    });

    // Step 2: Verify invitation is in PENDING status
    if (memberRecord.invitationStatus !== 'PENDING') {
      console.error(`[respondToInvitation] ❌ Invalid status: ${memberRecord.invitationStatus} (expected PENDING)`);
      const invalidStatusError: Error = new Error('Invitation not found or already responded');
      invalidStatusError.statusCode = 404;
      throw invalidStatusError;
    }

    // Step 3: Get team info to check if current user is the team leader
    const team = await this.teamRepo.findById(memberRecord.teamId);
    if (!team) {
      console.error(`[respondToInvitation] ❌ Team not found: ${memberRecord.teamId}`);
      throw new Error('Team not found');
    }

    // Step 4: Authorization check - TWO VALID CASES:
    // Case 1: Current user IS the one being invited (mahasiswaId === memberRecord.mahasiswaId)
    const isBeingInvited = memberRecord.mahasiswaId === mahasiswaId;
    
    // Case 2: Current user IS the team leader (mahasiswaId === team.leaderMahasiswaId)
    const isTeamLeader = mahasiswaId === team.leaderMahasiswaId;

    console.log(`[respondToInvitation] 🔐 Authorization check:`, {
      isBeingInvited,
      isTeamLeader,
      currentMahasiswaId: mahasiswaId,
      inviteeMahasiswaId: memberRecord.mahasiswaId,
      teamLeaderId: team.leaderMahasiswaId
    });

    if (!isBeingInvited && !isTeamLeader) {
      console.error(`[respondToInvitation] ❌ Unauthorized: User is neither invitee nor team leader`);
      const unauthorizedError: Error = new Error('Unauthorized: only team leader or invitee can respond');
      unauthorizedError.statusCode = 403;
      throw unauthorizedError;
    }

    console.log(`[respondToInvitation] ✅ Valid authorization: teamId=${memberRecord.teamId}`);

    const status = accept ? 'ACCEPTED' : 'REJECTED';
    
    // Step 5: If accepting and user IS the invitee, handle auto-delete of old team
    if (accept && isBeingInvited) {
      console.log(`[respondToInvitation] Checking for existing teams as leader...`);
      // Check if user has an existing team as leader
      const existingTeamsAsLeader = await this.teamRepo.findByLeaderMahasiswaId(mahasiswaId);
      if (existingTeamsAsLeader.length > 0) {
        console.log(`[respondToInvitation] Found ${existingTeamsAsLeader.length} existing team(s) as leader`);
        // Auto-delete old teams where user is leader
        for (const oldTeam of existingTeamsAsLeader) {
          try {
            console.log(`[respondToInvitation] Auto-deleting old team: ${oldTeam.id}`);
            await this.teamRepo.deleteTeam(oldTeam.id);
            console.log(`[respondToInvitation] ✅ Old team deleted: ${oldTeam.id}`);
          } catch (error) {
            console.error(`[respondToInvitation] ⚠️ Error deleting old team ${oldTeam.id}:`, error);
            // Continue even if delete fails
          }
        }
      } else {
        console.log(`[respondToInvitation] No existing teams to delete`);
      }
    }
    
    // Step 6: Update member status
    console.log(`[respondToInvitation] Updating member status to ${status}...`);
    const updatedMember = await this.teamRepo.updateMemberStatus(memberRecord.id, status);
    console.log(`[respondToInvitation] ✅ Status updated to ${status}`);

    console.log(`[respondToInvitation] ✅ Successfully responded to invitation with status: ${status}`);
    return { success: true, status, member: updatedMember };
  }

  async getTeamMembers(teamId: string, sessionId: string) {
    // Ensure team exists
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      const notFound: Error = new Error('Team not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    const members = await this.teamRepo.findMembersByTeamId(teamId);

    // Enrich members with user data from SSO
    const enrichedMembers = await Promise.all(
      members.map(async (member) => {
        const student = await this.mahasiswaService.getMahasiswaById(member.mahasiswaId, sessionId);

        return {
          id: member.id,
          teamId: member.teamId,
          mahasiswaId: member.mahasiswaId,
          role: member.role,
          status: member.invitationStatus,
          invitedBy: member.invitedByMahasiswaId,
          invitedAt: member.invitedAt,
          respondedAt: member.respondedAt,
          user: {
            id: student?.id || member.mahasiswaId,
            nim: student?.nim || '',
            name: student?.profile.fullName || 'Unknown',
            email: student?.profile.emails.find(e => e.isPrimary)?.email || '',
          },
        };
      })
    );

    // Sort: ACCEPTED first, then PENDING/REJECTED by invite time
    return enrichedMembers.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'ACCEPTED' ? -1 : 1;
      }
      return new Date(b.invitedAt).getTime() - new Date(a.invitedAt).getTime();
    });
  }

  async getMyTeams(mahasiswaId: string, sessionId: string) {
    console.log(`[getMyTeams] Fetching teams for mahasiswaId=${mahasiswaId}`);
    
    // Get all memberships for this user
    const userMemberships = await this.teamRepo.findMembershipByMahasiswaId(mahasiswaId);
    console.log(`[getMyTeams] Found ${userMemberships.length} total memberships`);
    
    // Filter only ACCEPTED memberships
    const acceptedMemberships = userMemberships.filter(m => m.invitationStatus === 'ACCEPTED');
    console.log(`[getMyTeams] Found ${acceptedMemberships.length} ACCEPTED memberships`);
    
    if (acceptedMemberships.length === 0) {
      console.log(`[getMyTeams] No active teams for user`);
      return [];
    }
    
    // Get team details for each accepted membership
    const teamsWithMembers = await Promise.all(
      acceptedMemberships.map(async (userMembership) => {
        const team = await this.teamRepo.findById(userMembership.teamId);
        if (!team) {
          console.warn(`[getMyTeams] ⚠️ Team not found: ${userMembership.teamId}`);
          return null;
        }

        const dosenKpId = team.dosenKpId
        const dosenSsoData = dosenKpId
          ? await this.dosenService.getDosenById(dosenKpId, sessionId)
          : null;
        
        // Get all members of this team (ALL statuses)
        const members = await this.teamRepo.findMembersByTeamId(team.id);
        
        // Enrich members with user data from SSO
        const enrichedMembers = await Promise.all(
          members.map(async (member) => {
            const student = await this.mahasiswaService.getMahasiswaById(member.mahasiswaId, sessionId);
            
            return {
              id: member.id,
              teamId: member.teamId,
              mahasiswaId: member.mahasiswaId,
              role: member.role,
              status: member.invitationStatus,
              invitedBy: member.invitedByMahasiswaId,
              invitedAt: member.invitedAt,
              respondedAt: member.respondedAt,
              user: {
                id: student?.id || member.mahasiswaId,
                nim: student?.nim || '',
                name: student?.profile.fullName || 'Unknown',
                email: student?.profile.emails.find(e => e.isPrimary)?.email || '',
              },
            };
          })
        );
        
        return {
          id: team.id,
          code: team.code,
          dosen_kp_id: dosenKpId,
          dosen_kp_name: dosenSsoData?.profile.fullName ?? null,
          leaderMahasiswaId: team.leaderMahasiswaId,
          isLeader: team.leaderMahasiswaId === mahasiswaId,
          status: team.status,
          members: enrichedMembers.sort((a, b) => {
            // Sort: ACCEPTED first, then PENDING, ordered by time
            if (a.status !== b.status) {
              return a.status === 'ACCEPTED' ? -1 : 1;
            }
            return new Date(b.invitedAt).getTime() - new Date(a.invitedAt).getTime();
          }),
        };
      })
    );
    
    // Filter out null values (teams that were not found)
    const validTeams = teamsWithMembers.filter(t => t !== null);
    console.log(`[getMyTeams] Returning ${validTeams.length} teams with members`);
    return validTeams;
  }

  async getMyInvitations(mahasiswaId: string, sessionId: string) {
    console.log(`[getMyInvitations] Fetching invitations for user: ${mahasiswaId}`);
    
    const invitations = await this.teamRepo.findInvitationsByMahasiswaId(mahasiswaId);
    console.log(`[getMyInvitations] Found ${invitations.length} invitations for user: ${mahasiswaId}`);
    
    if (invitations.length === 0) return [];
    
    // Enrich with team and inviter data
    const enrichedInvitations = await Promise.all(
      invitations.map(async (inv) => {
        // Get team info
        const team = await this.teamRepo.findById(inv.teamId);
        if (!team) {
          console.warn(`[getMyInvitations] ⚠️ Team not found for invitation ${inv.id}`);
          return null;
        }

        // Get team leader info (name and NIM) from SSO
        const leader = await this.mahasiswaService.getMahasiswaById(team.leaderMahasiswaId, sessionId);

        const leaderData = leader ? {
          id: leader.id,
          nim: leader.nim || 'Unknown',
          name: leader.profile.fullName || 'Unknown',
          email: leader.profile.emails.find(e => e.isPrimary)?.email || '',
        } : null;

        // Get inviter info from SSO
        let inviterData = null;
        if (inv.invitedByMahasiswaId) {
          const inviter = await this.mahasiswaService.getMahasiswaById(inv.invitedByMahasiswaId, sessionId);
          if (inviter) {
            inviterData = {
              id: inviter.id,
              nim: inviter.nim || '',
              name: inviter.profile.fullName || 'Unknown User',
              email: inviter.profile.emails.find(e => e.isPrimary)?.email || '',
            };
          }
        }

        return {
          id: inv.id,
          teamId: inv.teamId,
          mahasiswaId: inv.mahasiswaId,
          status: inv.invitationStatus,
          invitedBy: inv.invitedByMahasiswaId,
          invitedAt: inv.invitedAt,
          respondedAt: inv.respondedAt,
          team: {
            id: team.id,
            code: team.code,
            name: team.code,
            leaderName: leaderData?.name || 'Unknown',
            leaderNim: leaderData?.nim || 'Unknown',
          },
          inviter: inviterData,
        };
      })
    );

    // Filter out null values and sort by invited_at DESC
    return enrichedInvitations
      .filter(inv => inv !== null)
      .sort((a, b) => new Date(b.invitedAt).getTime() - new Date(a.invitedAt).getTime());
  }

  async cancelInvitation(memberId: string, leaderId: string) {
    console.log(`[cancelInvitation] Processing cancellation: memberId=${memberId}, leaderId=${leaderId}`);
    
    const leaderTeams = await this.teamRepo.findByLeaderMahasiswaId(leaderId);
    
    // Collect all member records from teams where user is leader
    let targetInvitation = null;
    for (const team of leaderTeams) {
      const members = await this.teamRepo.findMembersByTeamId(team.id);
      const found = members.find(m => m.id === memberId);
      if (found) {
        targetInvitation = found;
        break;
      }
    }

    if (!targetInvitation) {
      console.error(`[cancelInvitation] ❌ Invitation not found: ${memberId}`);
      const err: Error = new Error('Invitation not found');
      err.statusCode = 404;
      throw err;
    }

    // Get team info
    const team = await this.teamRepo.findById(targetInvitation.teamId);
    if (!team) {
      console.error(`[cancelInvitation] ❌ Team not found: ${targetInvitation.teamId}`);
      throw new Error('Team not found');
    }

    // Only leader can cancel invitations
    if (team.leaderMahasiswaId !== leaderId) {
      console.error(`[cancelInvitation] ❌ Unauthorized: User ${leaderId} is not leader of team ${team.id}`);
      const err: Error = new Error('Only team leader can cancel invitations');
      err.statusCode = 403;
      throw err;
    }

    // Can only cancel PENDING invitations
    if (targetInvitation.invitationStatus !== 'PENDING') {
      console.error(`[cancelInvitation] ❌ Cannot cancel non-PENDING invitation: status=${targetInvitation.invitationStatus}`);
      const err: Error = new Error(`Cannot cancel ${targetInvitation.invitationStatus.toLowerCase()} invitation`);
      err.statusCode = 400;
      throw err;
    }

    // Cannot cancel KETUA
    if (targetInvitation.role === 'KETUA' || targetInvitation.mahasiswaId === team.leaderMahasiswaId) {
      console.error(`[cancelInvitation] ❌ Cannot cancel KETUA invitation: ${memberId}`);
      const err: Error = new Error('Cannot cancel team leader invitation');
      err.statusCode = 400;
      throw err;
    }

    // Delete the invitation (member record)
    await this.teamRepo.removeMember(memberId);

    return {
      success: true,
      message: 'Invitation cancelled successfully',
      cancelledInvitationId: memberId,
      cancelledMahasiswaId: targetInvitation.mahasiswaId,
      teamId: team.id,
    };
  }

  async joinTeam(teamCode: string, mahasiswaId: string, sessionId: string) {
    console.log(`[joinTeam] Processing join request: teamCode=${teamCode}, mahasiswaId=${mahasiswaId}`);
    
    // 1. Find team by code
    const team = await this.teamRepo.findByCode(teamCode);
    
    if (!team) {
      const err: Error = new Error('Tim dengan kode tersebut tidak ditemukan');
      err.statusCode = 404;
      throw err;
    }

    // 2. Verify user exists from SSO
    const student = await this.mahasiswaService.getMahasiswaById(mahasiswaId, sessionId);
    if (!student) {
      throw new Error('User not found');
    }

    // 3. User cannot be team leader
    if (team.leaderMahasiswaId === mahasiswaId) {
      const err: Error = new Error('Anda adalah ketua tim ini. Tidak dapat mengirim permintaan bergabung pada tim sendiri');
      err.statusCode = 400;
      throw err;
    }

    // 4. User cannot already be a member (ACCEPTED)
    const existingMember = await this.teamRepo.findMemberByTeamAndMahasiswa(team.id, mahasiswaId);
    if (existingMember && existingMember.invitationStatus === 'ACCEPTED') {
      const err: Error = new Error('Anda sudah menjadi anggota tim ini');
      err.statusCode = 400;
      throw err;
    }

    // 5. Cannot have pending join request to same team
    if (existingMember && existingMember.invitationStatus === 'PENDING') {
      const err: Error = new Error('Anda sudah mengirim permintaan bergabung ke tim ini. Tunggu persetujuan dari ketua tim');
      err.statusCode = 400;
      throw err;
    }

    // 6. User cannot already be in another team (ACCEPTED)
    const allMemberships = await this.teamRepo.findMembershipByMahasiswaId(mahasiswaId);
    const otherTeamMembership = allMemberships.find(
      m => m.invitationStatus === 'ACCEPTED' && m.teamId !== team.id
    );
    if (otherTeamMembership) {
      const err: Error = new Error('Anda masih menjadi anggota tim lain. Silakan keluar atau hapus tim lama terlebih dahulu');
      err.statusCode = 400;
      throw err;
    }

    // 7. Team member count cannot exceed 3
    const teamMembers = await this.teamRepo.findMembersByTeamId(team.id);
    const acceptedMembers = teamMembers.filter(m => m.invitationStatus === 'ACCEPTED');
    if (acceptedMembers.length >= 3) {
      const err: Error = new Error('Tim ini sudah memiliki jumlah anggota maksimal (3 anggota)');
      err.statusCode = 400;
      throw err;
    }

    // Create team_members record with PENDING status
    const memberId = generateId();
    const member = await this.teamRepo.addMember({
      id: memberId,
      teamId: team.id,
      mahasiswaId: mahasiswaId,
      role: 'ANGGOTA',
      invitationStatus: 'PENDING',
      invitedByMahasiswaId: mahasiswaId,
      invitedAt: new Date(),
    });

    const teamLeader = await this.mahasiswaService.getMahasiswaById(team.leaderMahasiswaId, sessionId);

    return {
      success: true,
      message: 'Permintaan bergabung dengan tim berhasil dikirim',
      data: {
        memberId: member.id,
        teamId: member.teamId,
        teamCode: team.code,
        mahasiswaId: member.mahasiswaId,
        status: member.invitationStatus,
        createdAt: member.invitedAt,
        team: {
          id: team.id,
          code: team.code,
          leaderName: teamLeader?.profile.fullName || 'Unknown',
          leaderNim: teamLeader?.nim || 'Unknown',
        },
      },
    };
  }
}
