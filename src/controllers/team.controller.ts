import { Context } from 'hono';
import { TeamService } from '@/services/team.service';
import { createResponse, handleError } from '@/utils/helpers';
import { z } from 'zod';
import type { JWTPayload } from '@/types';

const createTeamSchema = z.object({});
// Team name tidak diperlukan, otomatis menggunakan nama ketua tim

const inviteMemberSchema = z.object({
  memberNim: z.string().min(1),
});

const respondInvitationSchema = z.object({
  accept: z.boolean(),
});

export class TeamController {
  constructor(private teamService: TeamService) {}

  createTeam = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      
      console.log(`[TeamController.createTeam] Request from userId=${user.userId}`);

      const team = await this.teamService.createTeam(user.userId);

      console.log(`[TeamController.createTeam] ✅ Success: ${team.code}`);
      return c.json(createResponse(true, 'Team created successfully', team), 201);
    } catch (error: any) {
      console.error(`[TeamController.createTeam] ❌ Error:`, error);
      return handleError(c, error, 'Failed to create team');
    }
  };

  inviteMember = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const teamId = c.req.param('teamId');
      const body = await c.req.json();
      const validated = inviteMemberSchema.parse(body);

      const invitation = await this.teamService.inviteMember(
        teamId,
        user.userId,
        validated.memberNim
      );

      return c.json(createResponse(true, 'Invitation sent successfully', invitation), 201);
    } catch (error: any) {
      return handleError(c, error, 'Failed to invite member');
    }
  };

  respondToInvitation = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const memberId = c.req.param('memberId');
      const body = await c.req.json();
      const validated = respondInvitationSchema.parse(body);

      const result = await this.teamService.respondToInvitation(
        memberId,
        user.userId,
        validated.accept
      );

      return c.json(createResponse(true, 'Invitation response recorded', result));
    } catch (error: any) {
      return handleError(c, error, 'Failed to respond to invitation');
    }
  };

  getTeamMembers = async (c: Context) => {
    try {
      const teamId = c.req.param('teamId');
      const members = await this.teamService.getTeamMembers(teamId);

      return c.json(createResponse(true, 'Team members retrieved', members));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get team members');
    }
  };

  getMyTeams = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const teams = await this.teamService.getMyTeams(user.userId);

      return c.json(createResponse(true, 'Teams retrieved', teams));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get teams');
    }
  };

  leaveTeam = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const teamId = c.req.param('teamId');

      console.log(`[TeamController.leaveTeam] Request from userId=${user.userId}, teamId=${teamId}`);

      const result = await this.teamService.leaveTeam(teamId, user.userId);

      console.log(`[TeamController.leaveTeam] ✅ Success: Member left team`);
      return c.json(createResponse(true, 'Successfully left the team', result));
    } catch (error: any) {
      console.error(`[TeamController.leaveTeam] ❌ Error:`, error);
      return handleError(c, error, 'Failed to leave team');
    }
  };

  removeMember = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const teamId = c.req.param('teamId');
      const memberId = c.req.param('memberId');

      console.log(`[TeamController.removeMember] Request from userId=${user.userId}, teamId=${teamId}, memberId=${memberId}`);

      const result = await this.teamService.removeMember(teamId, memberId, user.userId);

      console.log(`[TeamController.removeMember] ✅ Success: Member removed`);
      return c.json(createResponse(true, 'Member removed successfully', result));
    } catch (error: any) {
      console.error(`[TeamController.removeMember] ❌ Error:`, error);
      return handleError(c, error, 'Failed to remove member');
    }
  };

  deleteTeam = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const teamId = c.req.param('teamId');

      const result = await this.teamService.deleteTeam(teamId, user.userId);

      return c.json(createResponse(true, 'Team deleted successfully', result));
    } catch (error: any) {
      return handleError(c, error, 'Failed to delete team');
    }
  };

  finalizeTeam = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const teamId = c.req.param('teamId');

      console.log(`[TeamController.finalizeTeam] Request from userId=${user.userId}, teamId=${teamId}`);

      const result = await this.teamService.finalizeTeam(teamId, user.userId);

      console.log(`[TeamController.finalizeTeam] ✅ Success: Team finalized`);
      return c.json(createResponse(true, 'Tim berhasil difinalisasi', result), 200);
    } catch (error: any) {
      console.error(`[TeamController.finalizeTeam] ❌ Error:`, error);
      
      // Return appropriate status code from error
      const statusCode = error.statusCode || 500;
      return c.json(
        createResponse(false, error.message || 'Failed to finalize team', null),
        statusCode
      );
    }
  };

  getMyInvitations = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const invitations = await this.teamService.getMyInvitations(user.userId);

      return c.json(createResponse(true, 'Invitations retrieved', invitations));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get invitations');
    }
  };

  cancelInvitation = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const memberId = c.req.param('memberId');

      console.log(`[TeamController.cancelInvitation] Request from userId=${user.userId}, memberId=${memberId}`);

      const result = await this.teamService.cancelInvitation(memberId, user.userId);

      console.log(`[TeamController.cancelInvitation] ✅ Success: Invitation cancelled`);
      return c.json(createResponse(true, 'Invitation cancelled successfully', result));
    } catch (error: any) {
      console.error(`[TeamController.cancelInvitation] ❌ Error:`, error);
      return handleError(c, error, 'Failed to cancel invitation');
    }
  };

  joinTeam = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const teamCode = c.req.param('teamCode');

      console.log(`[TeamController.joinTeam] Request from userId=${user.userId}, teamCode=${teamCode}`);

      const result = await this.teamService.joinTeam(teamCode, user.userId);

      console.log(`[TeamController.joinTeam] ✅ Success: Join request created`);
      return c.json(result, 201);
    } catch (error: any) {
      console.error(`[TeamController.joinTeam] ❌ Error:`, error);
      return handleError(c, error, 'Failed to join team');
    }
  };
}
