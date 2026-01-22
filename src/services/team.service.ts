import { TeamRepository } from '@/repositories/team.repository';
import { ProfileServiceClient } from '@/utils/profile-service';
import { generateId, generateTeamCode } from '@/utils/helpers';

export class TeamService {
  constructor(
    private teamRepo: TeamRepository,
    private profileService: ProfileServiceClient
  ) {}

  async createTeam(leaderId: string, accessToken: string) {
    console.log(`[createTeam] 🚀 Starting team creation for leaderId=${leaderId}`);
    
    try {
      // Verify leader is mahasiswa through Profile Service
      const profileResponse = await this.profileService.getMahasiswaByAuthUserId(leaderId, accessToken);
      
      if (!profileResponse.success || !profileResponse.data) {
        console.error(`[createTeam] ❌ User is not a mahasiswa or profile not found`);
        throw new Error('Only students (mahasiswa) can create teams');
      }

      console.log(`[createTeam] ✅ User verified: ${profileResponse.data.name} (NIM: ${profileResponse.data.nim})`);

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
          role: 'KETUA', // ✅ CRITICAL: Set role to KETUA for creator
          invitationStatus: 'ACCEPTED',
          invitedBy: null,
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
      throw new Error(error instanceof Error ? error.message : 'Failed to create team');
    }
  }

  async leaveTeam(userId: string) {
    console.log(`[leaveTeam] Processing leave: userId=${userId}`);
    
    // Find user's team membership
    const memberships = await this.teamRepo.findMembershipByUserId(userId);
    const acceptedMembership = memberships.find(m => m.invitationStatus === 'ACCEPTED');
    
    if (!acceptedMembership) {
      console.error(`[leaveTeam] ❌ User not a member of any team: ${userId}`);
      throw new Error('You are not a member of any team');
    }
    
    const teamId = acceptedMembership.teamId;
    const team = await this.teamRepo.findById(teamId);
    
    if (!team) {
      console.error(`[leaveTeam] ❌ Team not found: ${teamId}`);
      throw new Error('Team not found');
    }

    // Prevent leader from leaving using this endpoint
    if (team.leaderId === userId) {
      console.error(`[leaveTeam] ❌ Leader cannot leave team, must delete instead: ${teamId}`);
      const err: any = new Error('Team leader cannot leave the team. Please delete the team instead.');
      err.statusCode = 403;
      throw err;
    }

    // Delete member record
    console.log(`[leaveTeam] Removing member: ${acceptedMembership.id}`);
    const deletedMember = await this.teamRepo.removeMember(acceptedMembership.id);
    console.log(`[leaveTeam] ✅ Member removed successfully:`, deletedMember);
    
    // Verify deletion
    const verifyMember = await this.teamRepo.findMemberByTeamAndUser(teamId, userId);
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

  async removeMember(teamId: string, memberId: string, leaderId: string) {
    console.log(`[removeMember] Processing removal: teamId=${teamId}, memberId=${memberId}, leaderId=${leaderId}`);
    
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      console.error(`[removeMember] ❌ Team not found: ${teamId}`);
      throw new Error('Team not found');
    }

    // Only leader can remove members
    if (team.leaderId !== leaderId) {
      console.error(`[removeMember] ❌ Unauthorized: User ${leaderId} is not leader of team ${teamId}`);
      const err: any = new Error('Only team leader can remove members');
      err.statusCode = 403;
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
    if (member.role === 'KETUA' || member.userId === team.leaderId) {
      console.error(`[removeMember] ❌ Cannot remove team leader: ${memberId}`);
      const err: any = new Error('Cannot remove team leader');
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
      removedMemberId: member.userId,
      teamId,
    };
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

    const members = await this.teamRepo.findMembersByTeamId(teamId);
    const membersAffected = members.length;
    console.log(`[deleteTeam] Found ${membersAffected} members to be affected`);

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

    if (team.status === 'FIXED') {
      console.warn(`[finalizeTeam] ⚠️ Team already finalized: ${teamId}`);
      throw new Error('Team is already finalized');
    }

    const members = await this.teamRepo.findMembersByTeamId(teamId);
    const acceptedMembers = members.filter(m => m.invitationStatus === 'ACCEPTED');
    
    console.log(`[finalizeTeam] Team has ${members.length} total members, ${acceptedMembers.length} accepted`);

    if (acceptedMembers.length < 1) {
      console.error(`[finalizeTeam] ❌ No accepted members yet`);
      throw new Error('At least 1 member must accept the invitation before finalizing');
    }

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

  async inviteMember(teamId: string, leaderId: string, memberNim: string, accessToken: string) {
    // Verify team exists and user is leader
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.leaderId !== leaderId) {
      throw new Error('Only team leader can invite members');
    }

    if (team.status === 'FIXED') {
      throw new Error('Cannot invite members to a finalized team');
    }

    // Find member by NIM from Profile Service
    const memberProfile = await this.profileService.getMahasiswaByNim(memberNim, accessToken);
    if (!memberProfile.success || !memberProfile.data) {
      throw new Error('Mahasiswa with this NIM not found');
    }

    const memberId = memberProfile.data.authUserId;

    // Check if member is already in the team
    const existingMember = await this.teamRepo.findMemberByTeamAndUser(teamId, memberId);
    if (existingMember) {
      if (existingMember.invitationStatus === 'PENDING') {
        throw new Error('Invitation already sent to this member');
      } else if (existingMember.invitationStatus === 'ACCEPTED') {
        throw new Error('This member is already in the team');
      } else if (existingMember.invitationStatus === 'REJECTED') {
        throw new Error('This member has rejected the invitation');
      }
    }

    // Check if member is already in another team
    const memberMemberships = await this.teamRepo.findMembershipByUserId(memberId);
    const acceptedMembership = memberMemberships.find(m => m.invitationStatus === 'ACCEPTED');
    if (acceptedMembership) {
      throw new Error('This student is already a member of another team');
    }

    // Add member with PENDING status
    const invitation = await this.teamRepo.addMember({
      id: generateId(),
      teamId,
      userId: memberId,
      userId: member.id,
      role: 'ANGGOTA', // ✅ Set role to ANGGOTA for invited members
      invitationStatus: 'PENDING',
      invitedBy: leaderId,
    });

    return invitation;
  }

  async respondToInvitation(memberId: string, userId: string, accept: boolean) {
    const member = await this.teamRepo.findMemberById(memberId);
    if (!member) {
      throw new Error('Invitation not found');
    }

    if (member.userId !== userId) {
      throw new Error('You can only respond to your own invitations');
    }

    if (member.invitationStatus !== 'PENDING') {
      throw new Error('Invitation has already been responded to');
    }

    // Step 3: Get team info to check if current user is the team leader
    const team = await this.teamRepo.findById(memberRecord.teamId);
    if (!team) {
      console.error(`[respondToInvitation] ❌ Team not found: ${memberRecord.teamId}`);
      throw new Error('Team not found');
    }

    // Step 4: Authorization check - TWO VALID CASES:
    // Case 1: Current user IS the one being invited (userId === memberRecord.userId)
    const isBeingInvited = memberRecord.userId === userId;
    
    // Case 2: Current user IS the team leader (userId === team.leaderId)
    const isTeamLeader = userId === team.leaderId;

    console.log(`[respondToInvitation] 🔐 Authorization check:`, {
      isBeingInvited,
      isTeamLeader,
      currentUserId: userId,
      inviteeUserId: memberRecord.userId,
      teamLeaderId: team.leaderId
    });

    if (!isBeingInvited && !isTeamLeader) {
      console.error(`[respondToInvitation] ❌ Unauthorized: User is neither invitee nor team leader`);
      const unauthorizedError: any = new Error('Unauthorized: only team leader or invitee can respond');
      unauthorizedError.statusCode = 403;
      throw unauthorizedError;
    }

    console.log(`[respondToInvitation] ✅ Valid authorization: teamId=${memberRecord.teamId}`);

    console.log(`[respondToInvitation] ✅ Valid authorization: teamId=${memberRecord.teamId}`);

    const status = accept ? 'ACCEPTED' : 'REJECTED';
    
    // Step 5: If accepting and user IS the invitee, handle auto-delete of old team
    if (accept && isBeingInvited) {
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
    
    // Step 6: Update member status
    console.log(`[respondToInvitation] Updating member status to ${status}...`);
    const updatedMember = await this.teamRepo.updateMemberStatus(memberRecord.id, status);
    console.log(`[respondToInvitation] ✅ Status updated to ${status}`);

    // ✅ REMOVED auto-FIXED logic - team stays PENDING until manually changed
    // This allows leader to continue inviting more members even after some accept

    console.log(`[respondToInvitation] ✅ Successfully responded to invitation with status: ${status}`);
    return { success: true, status, member: updatedMember };
  }

  async getTeamMembers(teamId: string) {
    // Ensure team exists
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      const notFound: any = new Error('Team not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    const members = await this.teamRepo.findMembersByTeamId(teamId);

    // Enrich members with user data
    const enrichedMembers = await Promise.all(
      members.map(async (member) => {
        const memberUser = await this.userRepo.findById(member.userId);
        const mahasiswaData = memberUser?.role === 'MAHASISWA'
          ? await this.userRepo.findMahasiswaByUserId(member.userId)
          : null;

        return {
          id: member.id,
          teamId: member.teamId,
          userId: member.userId,
          role: member.role, // ✅ Use role from database
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

    // Sort: ACCEPTED first, then PENDING/REJECTED by invite time
    return enrichedMembers.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'ACCEPTED' ? -1 : 1;
      }
      return new Date(b.invitedAt).getTime() - new Date(a.invitedAt).getTime();
    });
  }

  async getMyTeams(userId: string) {
    console.log(`[getMyTeams] Fetching teams for userId=${userId}`);
    
    // Get all memberships for this user
    const userMemberships = await this.teamRepo.findMembershipByUserId(userId);
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
        
        // Get all members of this team (ALL statuses)
        const members = await this.teamRepo.findMembersByTeamId(team.id);
        
        // Enrich members with user data
        const enrichedMembers = await Promise.all(
          members.map(async (member) => {
            const memberUser = await this.userRepo.findById(member.userId);
            const mahasiswaData = memberUser?.role === 'MAHASISWA' 
              ? await this.userRepo.findMahasiswaByUserId(member.userId) 
              : null;
            
            return {
              id: member.id,
              teamId: member.teamId,
              userId: member.userId,
              role: member.role, // ✅ Use role from database
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

    return invitationsWithDetails.filter(inv => inv !== null);
  }

  async cancelInvitation(memberId: string, leaderId: string) {
    const member = await this.teamRepo.findMemberById(memberId);
    if (!member) {
      throw new Error('Invitation not found');
    }

    const team = await this.teamRepo.findById(member.teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.leaderId !== leaderId) {
      throw new Error('Only team leader can cancel invitations');
    }

    if (member.invitationStatus !== 'PENDING') {
      throw new Error('Can only cancel pending invitations');
    }

    await this.teamRepo.removeMember(memberId);

    return {
      message: 'Invitation cancelled successfully',
      memberId,
    };
  }

  async cancelInvitation(memberId: string, leaderId: string) {
    console.log(`[cancelInvitation] Processing cancellation: memberId=${memberId}, leaderId=${leaderId}`);
    
    // Find the member/invitation record
    const memberRecords = await this.teamRepo.findMembershipByUserId(leaderId);
    console.log(`[cancelInvitation] Found ${memberRecords.length} memberships for user ${leaderId}`);
    
    // Find as a KETUA leader
    const leaderTeams = await this.teamRepo.findByLeaderId(leaderId);
    console.log(`[cancelInvitation] User is leader of ${leaderTeams.length} team(s)`);

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
      const err: any = new Error('Invitation not found');
      err.statusCode = 404;
      throw err;
    }

    console.log(`[cancelInvitation] ✅ Found invitation:`, {
      id: targetInvitation.id,
      status: targetInvitation.invitationStatus,
      userId: targetInvitation.userId
    });

    // Get team info
    const team = await this.teamRepo.findById(targetInvitation.teamId);
    if (!team) {
      console.error(`[cancelInvitation] ❌ Team not found: ${targetInvitation.teamId}`);
      throw new Error('Team not found');
    }

    // Only leader can cancel invitations
    if (team.leaderId !== leaderId) {
      console.error(`[cancelInvitation] ❌ Unauthorized: User ${leaderId} is not leader of team ${team.id}`);
      const err: any = new Error('Only team leader can cancel invitations');
      err.statusCode = 403;
      throw err;
    }

    // Can only cancel PENDING invitations
    if (targetInvitation.invitationStatus !== 'PENDING') {
      console.error(`[cancelInvitation] ❌ Cannot cancel non-PENDING invitation: status=${targetInvitation.invitationStatus}`);
      const err: any = new Error(`Cannot cancel ${targetInvitation.invitationStatus.toLowerCase()} invitation`);
      err.statusCode = 400;
      throw err;
    }

    // Cannot cancel KETUA
    if (targetInvitation.role === 'KETUA' || targetInvitation.userId === team.leaderId) {
      console.error(`[cancelInvitation] ❌ Cannot cancel KETUA invitation: ${memberId}`);
      const err: any = new Error('Cannot cancel team leader invitation');
      err.statusCode = 400;
      throw err;
    }

    // Delete the invitation (member record)
    console.log(`[cancelInvitation] Deleting invitation: ${memberId}`);
    const deletedInvitation = await this.teamRepo.removeMember(memberId);
    console.log(`[cancelInvitation] ✅ Invitation deleted successfully:`, deletedInvitation);
    
    // Verify deletion
    const allMembersAfter = await this.teamRepo.findMembersByTeamId(team.id);
    const verifyInvitation = allMembersAfter.find(m => m.id === memberId);
    if (verifyInvitation) {
      console.error(`[cancelInvitation] ⚠️ VERIFICATION FAILED: Invitation still exists after deletion!`);
      throw new Error('Failed to cancel invitation - please try again');
    }
    console.log(`[cancelInvitation] ✅ VERIFICATION: Invitation successfully deleted from database`);

    return {
      success: true,
      message: 'Invitation cancelled successfully',
      cancelledInvitationId: memberId,
      cancelledUserId: targetInvitation.userId,
      teamId: team.id,
    };
  }

  async joinTeam(teamCode: string, userId: string) {
    console.log(`[joinTeam] 🚀 Processing join request: teamCode=${teamCode}, userId=${userId}`);
    
    try {
      // ✅ CHECK 1: Verify team exists by code
      const team = await this.teamRepo.findByCode(teamCode);
      
      if (!team) {
        console.error(`[joinTeam] ❌ Team not found: ${teamCode}`);
        const err: any = new Error('Tim dengan kode tersebut tidak ditemukan');
        err.statusCode = 404;
        throw err;
      }

      console.log(`[joinTeam] ✅ Team found: ${team.id} (${team.code})`);

      // ✅ CHECK 2: Verify user exists
      const user = await this.userRepo.findById(userId);
      if (!user) {
        console.error(`[joinTeam] ❌ User not found: ${userId}`);
        throw new Error('User not found');
      }

      console.log(`[joinTeam] ✅ User verified: ${user.nama}`);

      // ✅ CHECK 3: User cannot be team leader
      if (team.leaderId === userId) {
        console.error(`[joinTeam] ❌ User is the team leader, cannot join own team`);
        const err: any = new Error('Anda adalah ketua tim ini. Tidak dapat mengirim permintaan bergabung pada tim sendiri');
        err.statusCode = 400;
        throw err;
      }

      // ✅ CHECK 4: User cannot already be a member (ACCEPTED)
      const existingMember = await this.teamRepo.findMemberByTeamAndUser(team.id, userId);
      if (existingMember && existingMember.invitationStatus === 'ACCEPTED') {
        console.error(`[joinTeam] ❌ User already member of this team`);
        const err: any = new Error('Anda sudah menjadi anggota tim ini');
        err.statusCode = 400;
        throw err;
      }

      // ✅ CHECK 5: Cannot have pending join request to same team
      if (existingMember && existingMember.invitationStatus === 'PENDING') {
        console.error(`[joinTeam] ❌ User already has PENDING request to this team`);
        const err: any = new Error('Anda sudah mengirim permintaan bergabung ke tim ini. Tunggu persetujuan dari ketua tim');
        err.statusCode = 400;
        throw err;
      }

      // ✅ CHECK 6: User cannot already be in another team (ACCEPTED)
      const allMemberships = await this.teamRepo.findMembershipByUserId(userId);
      const otherTeamMembership = allMemberships.find(
        m => m.invitationStatus === 'ACCEPTED' && m.teamId !== team.id
      );
      if (otherTeamMembership) {
        console.error(`[joinTeam] ❌ User already in another team: ${otherTeamMembership.teamId}`);
        const err: any = new Error('Anda masih menjadi anggota tim lain. Silakan keluar atau hapus tim lama terlebih dahulu');
        err.statusCode = 400;
        throw err;
      }

      // ✅ CHECK 7: Team member count cannot exceed 3
      const teamMembers = await this.teamRepo.findMembersByTeamId(team.id);
      const acceptedMembers = teamMembers.filter(m => m.invitationStatus === 'ACCEPTED');
      if (acceptedMembers.length >= 3) {
        console.error(`[joinTeam] ❌ Team is full: ${acceptedMembers.length} members`);
        const err: any = new Error('Tim ini sudah memiliki jumlah anggota maksimal (3 anggota)');
        err.statusCode = 400;
        throw err;
      }

      console.log(`[joinTeam] ✅ All validations passed, creating join request...`);

      // Create team_members record with PENDING status
      const memberId = generateId();
      const member = await this.teamRepo.addMember({
        id: memberId,
        teamId: team.id,
        userId: userId,
        role: 'ANGGOTA', // Always ANGGOTA for join requests
        invitationStatus: 'PENDING',
        invitedBy: userId, // Self-initiated join request
        invitedAt: new Date(),
      });

      console.log(`[joinTeam] ✅ Join request created: ${member.id}`);

      // Verify creation
      const verifyMember = await this.teamRepo.findMemberByTeamAndUser(team.id, userId);
      if (!verifyMember) {
        console.error(`[joinTeam] ⚠️ VERIFICATION FAILED: Member record not found after creation!`);
        throw new Error('Failed to create join request - please try again');
      }
      console.log(`[joinTeam] ✅ VERIFICATION: Member record confirmed in database`);

      const teamLeader = await this.userRepo.findById(team.leaderId);
      const leaderMahasiswa = teamLeader ? await this.userRepo.findMahasiswaByUserId(team.leaderId) : null;

      return {
        success: true,
        message: 'Permintaan bergabung dengan tim berhasil dikirim',
        data: {
          memberId: member.id,
          teamId: member.teamId,
          teamCode: team.code,
          userId: member.userId,
          status: member.invitationStatus,
          createdAt: member.invitedAt,
          team: {
            id: team.id,
            code: team.code,
            leaderName: teamLeader?.nama || 'Unknown',
            leaderNim: leaderMahasiswa?.nim || 'Unknown',
          },
        },
      };

    } catch (error: any) {
      console.error(`[joinTeam] ❌ Error joining team:`, error);
      
      // Re-throw with proper error message
      throw new Error(
        error instanceof Error 
          ? error.message 
          : 'Failed to join team'
      );
    }
  }
}
