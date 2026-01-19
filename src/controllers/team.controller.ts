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
      return c.json(createResponse(true, 'Team finalized successfully', result), 200);
    } catch (error: any) {
      console.error(`[TeamController.finalizeTeam] ❌ Error:`, error);
      return handleError(c, error, 'Failed to finalize team');
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
}
