import { TeamRepository } from '@/repositories/team.repository';
import { UserRepository } from '@/repositories/user.repository';
import { generateId, generateTeamCode } from '@/utils/helpers';

export class TeamService {
  constructor(
    private teamRepo: TeamRepository,
    private userRepo: UserRepository
  ) {}

  async createTeam(leaderId: string) {
    console.log(`[createTeam] 🚀 Starting team creation for leaderId=${leaderId}`);
    
    try {
      // Verify leader exists
      const leader = await this.userRepo.findById(leaderId);
      if (!leader) {
        console.error(`[createTeam] ❌ User not found: ${leaderId}`);
        throw new Error('User not found');
      }

      if (leader.role !== 'MAHASISWA') {
        console.error(`[createTeam] ❌ User is not MAHASISWA: ${leader.role}`);
        throw new Error('Only students can create teams');
      }

      console.log(`[createTeam] ✅ User verified: ${leader.nama} (${leader.role})`);

      // Check if user already has a team (as leader)
      const existingTeamsAsLeader = await this.teamRepo.findByLeaderId(leaderId);
      if (existingTeamsAsLeader.length > 0) {
        console.error(`[createTeam] ❌ User already has ${existingTeamsAsLeader.length} team(s)`);
        throw new Error('You already have a team. Each student can only create one team');
      }

      // Check if user is already a member of another team (ACCEPTED status)
      const existingMemberships = await this.teamRepo.findMembershipByUserId(leaderId);
      const acceptedMembership = existingMemberships.find(m => m.invitationStatus === 'ACCEPTED');
      if (acceptedMembership) {
        console.error(`[createTeam] ❌ User already member of team: ${acceptedMembership.teamId}`);
        throw new Error('You are already a member of another team. Each student can only join one team');
      }

      console.log(`[createTeam] ✅ Validation passed, creating team...`);

      // Create team with auto-generated code
      const team = await this.teamRepo.create({
        id: generateId(),
        code: generateTeamCode(),
        leaderId,
        status: 'PENDING',
      });

      console.log(`[createTeam] ✅ Team created: ${team.id} (${team.code})`);

      // Add leader as member with ACCEPTED status
      try {
        await this.teamRepo.addMember({
          id: generateId(),
          teamId: team.id,
          userId: leaderId,
          invitationStatus: 'ACCEPTED',
          invitedBy: null,  // ✅ NULL - Leader created team themselves (not invited)
        });
        
        console.log(`[createTeam] ✅ Leader added as member successfully`);
      } catch (memberError: any) {
        console.error(`[createTeam] ❌ Failed to add leader as member:`, memberError);
        
        // Rollback: Delete the team if adding member fails
        try {
          await this.teamRepo.deleteTeam(team.id);
          console.log(`[createTeam] 🔄 Team rolled back: ${team.id}`);
        } catch (rollbackError) {
          console.error(`[createTeam] ⚠️ Rollback failed:`, rollbackError);
        }
        
        throw new Error(`Failed to add leader to team: ${memberError.message}`);
      }

      console.log(`[createTeam] ✅ Team creation completed: ${team.code}`);
      return team;
      
    } catch (error: any) {
      console.error(`[createTeam] ❌ Error creating team:`, error);
      
      // Re-throw with proper error message
      throw new Error(
        error instanceof Error 
          ? error.message 
          : 'Failed to create team'
      );
    }
  }

  async deleteTeam(teamId: string, requesterId: string) {
    console.log(`[deleteTeam] Processing deletion: teamId=${teamId}, requesterId=${requesterId}`);
    
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      console.error(`[deleteTeam] ❌ Team not found: ${teamId}`);
      throw new Error('Team not found');
    }

    if (team.leaderId !== requesterId) {
      console.error(`[deleteTeam] ❌ Unauthorized: User ${requesterId} is not leader of team ${teamId}`);
      const err: any = new Error('Only team leader can delete the team');
      err.statusCode = 403;
      throw err;
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

  async finalizeTeam(teamId: string, requesterId: string) {
    console.log(`[finalizeTeam] Processing finalization: teamId=${teamId}, requesterId=${requesterId}`);
    
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      console.error(`[finalizeTeam] ❌ Team not found: ${teamId}`);
      throw new Error('Team not found');
    }

    if (team.leaderId !== requesterId) {
      console.error(`[finalizeTeam] ❌ Unauthorized: User ${requesterId} is not leader of team ${teamId}`);
      const err: any = new Error('Only team leader can finalize the team');
      err.statusCode = 403;
      throw err;
    }

    // Check if team is already FIXED
    if (team.status === 'FIXED') {
      console.warn(`[finalizeTeam] ⚠️ Team already finalized: ${teamId}`);
      throw new Error('Team is already finalized');
    }

    // Get all members and check if at least one accepted member exists
    const members = await this.teamRepo.findMembersByTeamId(teamId);
    const acceptedMembers = members.filter(m => m.invitationStatus === 'ACCEPTED');
    
    console.log(`[finalizeTeam] Team has ${members.length} total members, ${acceptedMembers.length} accepted`);

    if (acceptedMembers.length < 1) {
      console.error(`[finalizeTeam] ❌ No accepted members yet`);
      throw new Error('At least 1 member must accept the invitation before finalizing');
    }

    // Update team status to FIXED
    console.log(`[finalizeTeam] Updating team status to FIXED...`);
    const updatedTeam = await this.teamRepo.update(teamId, { status: 'FIXED' });
    console.log(`[finalizeTeam] ✅ Team finalized successfully`);

    return {
      id: updatedTeam?.id,
      code: updatedTeam?.code,
      status: updatedTeam?.status,
      message: `Team finalized with ${acceptedMembers.length} accepted member(s)`
    };
  }

  async inviteMember(teamId: string, leaderId: string, memberNim: string) {
    // Verify team exists and user is leader
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.leaderId !== leaderId) {
      throw new Error('Only team leader can invite members');
    }

    // ✅ Prevent inviting to FIXED teams
    if (team.status === 'FIXED') {
      throw new Error('Cannot invite members to a finalized team. Please create a new team if you want to add more members.');
    }

    // Find member by NIM
    const member = await this.userRepo.findByNim(memberNim);
    if (!member) {
      throw new Error('User not found');
    }

    if (member.role !== 'MAHASISWA') {
      throw new Error('Can only invite students');
    }

    // Check if already invited to THIS team
    const existingMember = await this.teamRepo.findMemberByTeamAndUser(teamId, member.id);
    if (existingMember) {
      const status = existingMember.invitationStatus;
      
      if (status === 'PENDING') {
        throw new Error('User already has a pending invitation to this team');
      } else if (status === 'ACCEPTED') {
        throw new Error('User is already a member of this team');
      } else if (status === 'REJECTED') {
        throw new Error('User has previously rejected invitation to this team');
      }
    }

    // ✅ Allow inviting users who already have other teams
    // Their old team will be auto-deleted when they accept the invitation

    // ✅ CRITICAL FIX: Add invitation with invitedBy field
    console.log(`[inviteMember] Creating invitation: teamId=${teamId}, userId=${member.id}, invitedBy=${leaderId}`);
    const invitation = await this.teamRepo.addMember({
      id: generateId(),
      teamId,
      userId: member.id,
      invitationStatus: 'PENDING',
      invitedBy: leaderId,  // ✅ CRITICAL: Set who invited this user
    });

    console.log(`[inviteMember] ✅ Invitation created: ${invitation.id}`);
    return invitation;
  }

  async respondToInvitation(memberId: string, userId: string, accept: boolean) {
    console.log(`[respondToInvitation] 🔍 Processing: memberId=${memberId}, userId=${userId}, accept=${accept}`);
    
    // DEBUG: Check all memberships first
    const allMemberships = await this.teamRepo.findMembershipByUserId(userId);
    console.log(`[respondToInvitation] 📊 User has ${allMemberships.length} total memberships:`, 
      allMemberships.map(m => ({ id: m.id, status: m.invitationStatus, teamId: m.teamId })));
    
    // Step 1: Find the member record with explicit user_id ownership check
    const userMember = await this.teamRepo.findMemberById(memberId, userId);
    
    if (!userMember) {
      console.error(`[respondToInvitation] ❌ Member not found or does not belong to user: memberId=${memberId}, userId=${userId}`);
      console.error(`[respondToInvitation] 🔍 Looking for: { id: ${memberId}, userId: ${userId} }`);
      console.error(`[respondToInvitation] 📋 Available memberships:`, allMemberships);
      const notFoundError: any = new Error('Invitation not found or already responded');
      notFoundError.statusCode = 404;
      throw notFoundError;
    }

    console.log(`[respondToInvitation] ✅ Found member record:`, {
      id: userMember.id,
      userId: userMember.userId,
      teamId: userMember.teamId,
      status: userMember.invitationStatus
    });

    // Step 2: Verify invitation is in PENDING status
    if (userMember.invitationStatus !== 'PENDING') {
      console.error(`[respondToInvitation] ❌ Invalid status: ${userMember.invitationStatus} (expected PENDING)`);
      const invalidStatusError: any = new Error('Invitation not found or already responded');
      invalidStatusError.statusCode = 404;
      throw invalidStatusError;
    }
    
    console.log(`[respondToInvitation] ✅ Valid invitation found: teamId=${userMember.teamId}`);

    const status = accept ? 'ACCEPTED' : 'REJECTED';
    
    // Step 3: If accepting, handle auto-delete of old team
    if (accept) {
      console.log(`[respondToInvitation] Checking for existing teams as leader...`);
      // Check if user has an existing team as leader
      const existingTeamsAsLeader = await this.teamRepo.findByLeaderId(userId);
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
    
    // Step 4: Update member status
    console.log(`[respondToInvitation] Updating member status to ${status}...`);
    const updatedMember = await this.teamRepo.updateMemberStatus(userMember.id, status);
    console.log(`[respondToInvitation] ✅ Status updated to ${status}`);

    // ✅ REMOVED auto-FIXED logic - team stays PENDING until manually changed
    // This allows leader to continue inviting more members even after some accept

    console.log(`[respondToInvitation] ✅ Successfully responded to invitation with status: ${status}`);
    return { success: true, status, member: updatedMember };
  }

  async getTeamMembers(teamId: string) {
    return await this.teamRepo.findMembersByTeamId(teamId);
  }

  async getMyTeams(userId: string) {
    console.log(`[getMyTeams] Fetching teams for userId=${userId}`);
    
    // ✅ FIX: Get teams where user is leader OR accepted member
    const leaderTeams = await this.teamRepo.findByLeaderId(userId);
    const memberTeams = await this.teamRepo.findTeamsByMemberId(userId);
    
    console.log(`[getMyTeams] Found ${leaderTeams.length} teams as leader, ${memberTeams.length} teams as member`);
    
    // Merge and deduplicate (user might be both leader and member)
    const allTeamIds = new Set([
      ...leaderTeams.map(t => t.id),
      ...memberTeams.map(t => t.id)
    ]);
    
    const allTeams = Array.from(allTeamIds).map(teamId => {
      return leaderTeams.find(t => t.id === teamId) || memberTeams.find(t => t.id === teamId);
    }).filter(Boolean);
    
    console.log(`[getMyTeams] Total unique teams: ${allTeams.length}`);
    
    // For each team, get ALL members (ACCEPTED + PENDING)
    const teamsWithMembers = await Promise.all(
      allTeams.map(async (team) => {
        // Get all members of this team (ALL statuses)
        const members = await this.teamRepo.findMembersByTeamId(team.id);
        
        // Enrich members with user data
        const enrichedMembers = await Promise.all(
          members.map(async (member) => {
            const memberUser = await this.userRepo.findById(member.userId);
            const mahasiswaData = memberUser?.role === 'MAHASISWA' 
              ? await this.userRepo.findMahasiswaByUserId(member.userId) 
              : null;
            
            // Determine role: KETUA if user is leader, ANGGOTA otherwise
            const memberRole = member.userId === team.leaderId ? 'KETUA' : 'ANGGOTA';
            
            return {
              id: member.id,
              teamId: member.teamId,
              userId: member.userId,
              role: memberRole,
              status: member.invitationStatus,
              invitedBy: member.invitedBy,
              invitedAt: member.invitedAt,
              respondedAt: member.respondedAt,
              user: {
                id: memberUser?.id || '',
                nim: mahasiswaData?.nim || '',
                name: memberUser?.nama || '',
                email: memberUser?.email || '',
              },
            };
          })
        );
        
        return {
          id: team.id,
          code: team.code,
          leaderId: team.leaderId,
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
    
    console.log(`[getMyTeams] Returning ${teamsWithMembers.length} teams with members`);
    return teamsWithMembers;
  }

  async getMyInvitations(userId: string) {
    console.log(`[getMyInvitations] Fetching invitations for userId=${userId}`);
    
    // ✅ Get ALL invitations (not just PENDING), frontend will filter
    const invitations = await this.teamRepo.getPendingInvitations(userId);
    console.log(`[getMyInvitations] Found ${invitations.length} total invitations (all statuses)`);
    
    // Log status breakdown
    const statusBreakdown = invitations.reduce((acc, inv) => {
      acc[inv.invitationStatus] = (acc[inv.invitationStatus] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`[getMyInvitations] Status breakdown:`, statusBreakdown);

    // Enrich with team and inviter data
    const enrichedInvitations = await Promise.all(
      invitations.map(async (inv) => {
        console.log(`[getMyInvitations] Processing invitation ${inv.id}, status=${inv.invitationStatus}, invitedBy=${inv.invitedBy}`);
        
        // Get team info
        const team = await this.teamRepo.findById(inv.teamId);
        if (!team) {
          console.warn(`[getMyInvitations] ⚠️ Team not found for invitation ${inv.id}`);
          return null;
        }

        // ✅ CRITICAL FIX: Get inviter info with proper null handling
        let inviterData = null;
        if (inv.invitedBy) {
          const inviter = await this.userRepo.findById(inv.invitedBy);
          if (inviter) {
            const inviterMahasiswa = inviter.role === 'MAHASISWA'
              ? await this.userRepo.findMahasiswaByUserId(inv.invitedBy)
              : null;
            
            inviterData = {
              id: inviter.id,
              nim: inviterMahasiswa?.nim || '',
              name: inviter.nama || 'Unknown User',  // ✅ Fallback to 'Unknown User' if nama is null
              email: inviter.email || '',
            };
            
            console.log(`[getMyInvitations] ✅ Inviter found: ${inviterData.name} (${inviterData.nim})`);
          } else {
            console.warn(`[getMyInvitations] ⚠️ Inviter user not found: ${inv.invitedBy}`);
          }
        } else {
          console.warn(`[getMyInvitations] ⚠️ No invitedBy field for invitation ${inv.id}`);
        }

        return {
          id: inv.id,
          teamId: inv.teamId,  // ✅ CRITICAL: Include teamId
          userId: inv.userId,
          status: inv.invitationStatus,
          invitedBy: inv.invitedBy,
          invitedAt: inv.invitedAt,
          respondedAt: inv.respondedAt,
          team: {
            id: team.id,
            code: team.code,
            name: team.code, // Using code as name since teams table doesn't have name
          },
          inviter: inviterData,  // ✅ Will be null if inviter not found, or object with data
        };
      })
    );

    // Filter out null values and sort by invited_at DESC
    const validInvitations = enrichedInvitations
      .filter(inv => inv !== null)
      .sort((a, b) => new Date(b.invitedAt).getTime() - new Date(a.invitedAt).getTime());
    
    console.log(`[getMyInvitations] Returning ${validInvitations.length} valid invitations`);
    return validInvitations;
  }
}
