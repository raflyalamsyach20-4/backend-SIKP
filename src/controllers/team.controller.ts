import { Context } from 'hono';
import { TeamService } from '@/services/team.service';
import { createResponse, handleError } from '@/utils/helpers';
import { inviteMemberSchema, respondInvitationSchema } from '@/schemas/team.schema';
import { TeamResetService } from '@/services';

type ErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 500;

export class TeamController {
  private teamService: TeamService;
  private teamResetService: TeamResetService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.teamService = new TeamService(this.c.env);
    this.teamResetService = new TeamResetService(this.c.env);
  }

  createTeam = async () => {
    try {
      const user = this.c.get('user');
      
      console.log(`[TeamController.createTeam] Request from mahasiswaId=${user.mahasiswaId}, profileId=${user.profileId}, dosenPAId=${user.dosenPAId}`);

      if (!user.mahasiswaId) {
        throw new Error('mahasiswaId not found in session - SSO profile incomplete or student identity not selected');
      }

      const team = await this.teamService.createTeam(user.mahasiswaId, user.dosenPAId);

      console.log(`[TeamController.createTeam] ✅ Success: ${team.code}`);
      return this.c.json(createResponse(true, 'Team created successfully', team), 201);
    } catch (error) {
      console.error(`[TeamController.createTeam] ❌ Error:`, error);
      return handleError(this.c, error, 'Failed to create team');
    }
  };

  inviteMember = async () => {
    try {
      const user = this.c.get('user');
      const teamId = this.c.req.param('teamId');
      const body = await this.c.req.json();
      const validated = inviteMemberSchema.parse(body);

      if (!user.mahasiswaId) {
        throw new Error('mahasiswaId not found in session - student identity required');
      }

      const invitation = await this.teamService.inviteMember(
        teamId,
        user.mahasiswaId,
        validated.memberNim,
        this.c.get('sessionId')
      );

      return this.c.json(createResponse(true, 'Invitation sent successfully', invitation), 201);
    } catch (error) {
      return handleError(this.c, error, 'Failed to invite member');
    }
  };

  respondToInvitation = async () => {
    try {
      const user = this.c.get('user');
      const memberId = this.c.req.param('memberId');
      const body = await this.c.req.json();
      const validated = respondInvitationSchema.parse(body);

      if (!user.mahasiswaId) {
        throw new Error('mahasiswaId not found in session');
      }

      const result = await this.teamService.respondToInvitation(
        memberId,
        user.mahasiswaId,
        validated.accept
      );

      return this.c.json(createResponse(true, 'Invitation response recorded', result));
    } catch (error) {
      return handleError(this.c, error, 'Failed to respond to invitation');
    }
  };

  getTeamMembers = async () => {
    try {
      const teamId = this.c.req.param('teamId');
      const members = await this.teamService.getTeamMembers(teamId, this.c.get('sessionId'));

      return this.c.json(createResponse(true, 'Team members retrieved', members));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get team members');
    }
  };

  getMyTeams = async () => {
    try {
      const user = this.c.get('user');
      const sessionId = this.c.get('sessionId');
      
      if (!user.mahasiswaId) throw new Error('mahasiswaId not found in session');
      const teams = await this.teamService.getMyTeams(user.mahasiswaId, sessionId);

      return this.c.json(createResponse(true, 'Teams retrieved', teams));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get teams');
    }
  };

  leaveTeam = async () => {
    try {
      const user = this.c.get('user');
      const teamId = this.c.req.param('teamId');

      if (!user.mahasiswaId) throw new Error('mahasiswaId not found in session');
      console.log(`[TeamController.leaveTeam] Request from mahasiswaId=${user.mahasiswaId}, teamId=${teamId}`);

      const result = await this.teamService.leaveTeam(teamId, user.mahasiswaId);

      console.log(`[TeamController.leaveTeam] ✅ Success: Member left team`);
      return this.c.json(createResponse(true, 'Successfully left the team', result));
    } catch (error) {
      console.error(`[TeamController.leaveTeam] ❌ Error:`, error);
      return handleError(this.c, error, 'Failed to leave team');
    }
  };

  removeMember = async () => {
    try {
      const user = this.c.get('user');
      const teamId = this.c.req.param('teamId');
      const memberId = this.c.req.param('memberId');

      if (!user.mahasiswaId) throw new Error('mahasiswaId not found in session');
      console.log(`[TeamController.removeMember] Request from mahasiswaId=${user.mahasiswaId}, teamId=${teamId}, memberId=${memberId}`);

      const result = await this.teamService.removeMember(teamId, memberId, user.mahasiswaId);

      console.log(`[TeamController.removeMember] ✅ Success: Member removed`);
      return this.c.json(createResponse(true, 'Member removed successfully', result));
    } catch (error) {
      console.error(`[TeamController.removeMember] ❌ Error:`, error);
      return handleError(this.c, error, 'Failed to remove member');
    }
  };

  deleteTeam = async () => {
    try {
      const user = this.c.get('user');
      const teamId = this.c.req.param('teamId');

      if (!user.mahasiswaId) throw new Error('mahasiswaId not found in session');
      const result = await this.teamService.deleteTeam(teamId, user.mahasiswaId);

      return this.c.json(createResponse(true, 'Team deleted successfully', result));
    } catch (error) {
      return handleError(this.c, error, 'Failed to delete team');
    }
  };

  finalizeTeam = async () => {
    try {
      const user = this.c.get('user');
      const teamId = this.c.req.param('teamId');

      if (!user.mahasiswaId) throw new Error('mahasiswaId not found in session');
      console.log(`[TeamController.finalizeTeam] Request from mahasiswaId=${user.mahasiswaId}, teamId=${teamId}`);

      const result = await this.teamService.finalizeTeam(teamId, user.mahasiswaId);

      console.log(`[TeamController.finalizeTeam] ✅ Success: Team finalized`);
      return this.c.json(createResponse(true, 'Tim berhasil difinalisasi', result), 200);
    } catch (error) {
      console.error(`[TeamController.finalizeTeam] ❌ Error:`, error);
      
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
      return this.c.json(
        createResponse(false, appError.message || 'Failed to finalize team', null),
        statusCode
      );
    }
  };

  getMyInvitations = async () => {
    try {
      const user = this.c.get('user');

      if (!user.mahasiswaId) throw new Error('mahasiswaId not found in session');
      const invitations = await this.teamService.getMyInvitations(user.mahasiswaId, this.c.get('sessionId'));

      return this.c.json(createResponse(true, 'Invitations retrieved', invitations));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get invitations');
    }
  };

  cancelInvitation = async () => {
    try {
      const user = this.c.get('user');
      const memberId = this.c.req.param('memberId');

      if (!user.mahasiswaId) throw new Error('mahasiswaId not found in session');
      console.log(`[TeamController.cancelInvitation] Request from mahasiswaId=${user.mahasiswaId}, memberId=${memberId}`);

      const result = await this.teamService.cancelInvitation(memberId, user.mahasiswaId);

      console.log(`[TeamController.cancelInvitation] ✅ Success: Invitation cancelled`);
      return this.c.json(createResponse(true, 'Invitation cancelled successfully', result));
    } catch (error) {
      console.error(`[TeamController.cancelInvitation] ❌ Error:`, error);
      return handleError(this.c, error, 'Failed to cancel invitation');
    }
  };

  joinTeam = async () => {
    try {
      const user = this.c.get('user');
      const teamCode = this.c.req.param('teamCode');

      if (!user.mahasiswaId) throw new Error('mahasiswaId not found in session');
      console.log(`[TeamController.joinTeam] Request from mahasiswaId=${user.mahasiswaId}, teamCode=${teamCode}`);

      const result = await this.teamService.joinTeam(teamCode, user.mahasiswaId, this.c.get('sessionId'));

      console.log(`[TeamController.joinTeam] ✅ Success: Join request created`);
      return this.c.json(result, 201);
    } catch (error) {
      console.error(`[TeamController.joinTeam] ❌ Error:`, error);
      return handleError(this.c, error, 'Failed to join team');
    }
  };

  resetTeam = async () => {
    try {
      const user = this.c.get('user');
      const sessionId = this.c.get('sessionId');
      
      if (!user.mahasiswaId) throw new Error('mahasiswaId not found in session');
      console.log(`[TeamController.resetTeam] Request from mahasiswaId=${user.mahasiswaId}`);

      const myTeams = await this.teamService.getMyTeams(user.mahasiswaId, sessionId);
      
      if (!myTeams || myTeams.length === 0) {
        console.error(`[TeamController.resetTeam] ❌ User has no teams`);
        return this.c.json(
          createResponse(false, 'Anda tidak memiliki tim yang dapat direset'),
          404
        );
      }

      const team = myTeams[0];
      console.log(`[TeamController.resetTeam] Found team: ${team.code} (${team.id})`);

      const result = await this.teamResetService.resetTeamByTeamId(team.id);

      console.log(`[TeamController.resetTeam] ✅ Success: Team reset completed`);
      return this.c.json(
        createResponse(true, 'Tim berhasil direset. Anda dapat membuat submission baru.', result)
      );
    } catch (error) {
      console.error(`[TeamController.resetTeam] ❌ Error:`, error);
      return handleError(this.c, error, 'Failed to reset team');
    }
  };
}
