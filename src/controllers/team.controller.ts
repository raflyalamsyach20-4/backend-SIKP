import { Context } from 'hono';
import { TeamService } from '@/services/team.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';
import { inviteMemberSchema, respondInvitationSchema } from '@/schemas/team.schema';
import { DIContainer } from '@/core';

type ErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 500;

export class TeamController {
  constructor(private teamService: TeamService) {}

  createTeam = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      
      console.log(`[TeamController.createTeam] Request from profileId=${user.profileId}, dosenPAId=${user.dosenPAId}`);

      // ✅ Use profileId (not authUserId/sub) as team leader identifier
      if (!user.profileId) {
        throw new Error('profileId not found in session - SSO profile incomplete');
      }

      // ✅ Pass profileId and dosenPAId directly from JWT
      const team = await this.teamService.createTeam(user.profileId, user.dosenPAId);

      console.log(`[TeamController.createTeam] ✅ Success: ${team.code}`);
      return c.json(createResponse(true, 'Team created successfully', team), 201);
    } catch (error) {
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
        user.userId, // ✅ userId is now profileId for team operations
        validated.memberNim
      );

      return c.json(createResponse(true, 'Invitation sent successfully', invitation), 201);
    } catch (error) {
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
    } catch (error) {
      return handleError(c, error, 'Failed to respond to invitation');
    }
  };

  getTeamMembers = async (c: Context) => {
    try {
      const teamId = c.req.param('teamId');
      const members = await this.teamService.getTeamMembers(teamId);

      return c.json(createResponse(true, 'Team members retrieved', members));
    } catch (error) {
      return handleError(c, error, 'Failed to get team members');
    }
  };

  getMyTeams = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const teams = await this.teamService.getMyTeams(user.userId);

      return c.json(createResponse(true, 'Teams retrieved', teams));
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      console.error(`[TeamController.finalizeTeam] ❌ Error:`, error);
      
      // Return appropriate status code from error
      const appError = error as Error & { statusCode?: number };
      const statusCodeRaw = appError.statusCode || 500;
      const statusCode: ErrorStatusCode =
        statusCodeRaw === 400 ||
        statusCodeRaw === 401 ||
        statusCodeRaw === 403 ||
        statusCodeRaw === 404 ||
        statusCodeRaw === 409 ||
        statusCodeRaw === 422
          ? statusCodeRaw
          : 500;
      return c.json(
        createResponse(false, appError.message || 'Failed to finalize team', null),
        statusCode
      );
    }
  };

  getMyInvitations = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const invitations = await this.teamService.getMyInvitations(user.userId);

      return c.json(createResponse(true, 'Invitations retrieved', invitations));
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      console.error(`[TeamController.joinTeam] ❌ Error:`, error);
      return handleError(c, error, 'Failed to join team');
    }
  };

  /**
   * Reset team (student-initiated)
   * Deletes all submissions and resets team status to PENDING
   * POST /api/teams/reset
   */
  resetTeam = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      
      console.log(`[TeamController.resetTeam] Request from userId=${user.userId}`);

      // Get user's teams
      const myTeams = await this.teamService.getMyTeams(user.userId);
      
      if (!myTeams || myTeams.length === 0) {
        console.error(`[TeamController.resetTeam] ❌ User has no teams`);
        return c.json(
          createResponse(false, 'Anda tidak memiliki tim yang dapat direset'),
          404
        );
      }

      // Get the first team (user can only have one active team)
      const team = myTeams[0];
      console.log(`[TeamController.resetTeam] Found team: ${team.code} (${team.id})`);

      // Access teamResetService from container
      const container = c.get('container') as DIContainer;
      const result = await container.teamResetService.resetTeamByTeamId(team.id);

      console.log(`[TeamController.resetTeam] ✅ Success: Team reset completed`);
      return c.json(
        createResponse(true, 'Tim berhasil direset. Anda dapat membuat submission baru.', result)
      );
    } catch (error) {
      console.error(`[TeamController.resetTeam] ❌ Error:`, error);
      return handleError(c, error, 'Failed to reset team');
    }
  };
}
