import { TeamRepository } from '@/repositories/team.repository';
import { UserRepository } from '@/repositories/user.repository';
import { generateId } from '@/utils/helpers';

export class TeamService {
  constructor(
    private teamRepo: TeamRepository,
    private userRepo: UserRepository
  ) {}

  async createTeam(leaderId: string, teamName: string) {
    // Verify leader exists
    const leader = await this.userRepo.findById(leaderId);
    if (!leader) {
      throw new Error('User not found');
    }

    if (leader.role !== 'MAHASISWA') {
      throw new Error('Only students can create teams');
    }

    // Create team
    const team = await this.teamRepo.create({
      id: generateId(),
      name: teamName,
      leaderId,
      status: 'PENDING',
    });

    // Add leader as member with ACCEPTED status
    await this.teamRepo.addMember({
      id: generateId(),
      teamId: team.id,
      userId: leaderId,
      invitationStatus: 'ACCEPTED',
    });

    return team;
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

    if (team.status === 'FIXED') {
      throw new Error('Cannot invite members to a fixed team');
    }

    // Find member by NIM
    const member = await this.userRepo.findByNim(memberNim);
    if (!member) {
      throw new Error('User not found');
    }

    if (member.role !== 'MAHASISWA') {
      throw new Error('Can only invite students');
    }

    // Check if already a member
    const existingMember = await this.teamRepo.findMemberByTeamAndUser(teamId, member.id);
    if (existingMember) {
      throw new Error('User is already invited or a member');
    }

    // Add invitation
    const invitation = await this.teamRepo.addMember({
      id: generateId(),
      teamId,
      userId: member.id,
      invitationStatus: 'PENDING',
    });

    return invitation;
  }

  async respondToInvitation(memberId: string, userId: string, accept: boolean) {
    const member = await this.teamRepo.findMemberByTeamAndUser('', userId);
    
    // Find the actual member record
    const memberRecord = await this.teamRepo.findMembersByTeamId(memberId);
    const userMember = memberRecord.find(m => m.userId === userId && m.invitationStatus === 'PENDING');
    
    if (!userMember) {
      throw new Error('Invitation not found or already responded');
    }

    const status = accept ? 'ACCEPTED' : 'REJECTED';
    await this.teamRepo.updateMemberStatus(userMember.id, status);

    // Check if all members accepted - if yes, update team status to FIXED
    if (accept) {
      const allMembers = await this.teamRepo.findMembersByTeamId(userMember.teamId);
      const allAccepted = allMembers.every(m => m.invitationStatus === 'ACCEPTED');
      
      if (allAccepted) {
        await this.teamRepo.update(userMember.teamId, { status: 'FIXED' });
      }
    }

    return { success: true, status };
  }

  async getTeamMembers(teamId: string) {
    return await this.teamRepo.findMembersByTeamId(teamId);
  }

  async getMyTeams(userId: string) {
    // Get teams where user is leader
    const leaderTeams = await this.teamRepo.findByLeaderId(userId);
    
    // Get teams where user is member
    // This would require a more complex query in production
    
    return leaderTeams;
  }
}
