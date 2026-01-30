import { Context } from 'hono';
import { TeamService } from '@/services/team.service';
import { createResponse, handleError } from '@/utils/helpers';
import { z } from 'zod';
import type { AuthContext } from '@/middlewares/auth.middleware';

const createTeamSchema = z.object({});

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
      const auth = c.get('auth') as AuthContext;
      const token = c.req.header('Authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return c.json({ error: 'Unauthorized', message: 'No token provided' }, 401);
      }

      const team = await this.teamService.createTeam(auth.userId, token);

      return c.json(createResponse(true, 'Team created successfully', team), 201);
    } catch (error: any) {
      return handleError(c, error, 'Failed to create team');
    }
  };

  inviteMember = async (c: Context) => {
    try {
      const auth = c.get('auth') as AuthContext;
      const token = c.req.header('Authorization')?.replace('Bearer ', '');
      const teamId = c.req.param('teamId');
      const body = await c.req.json();
      const validated = inviteMemberSchema.parse(body);

      if (!token) {
        return c.json({ error: 'Unauthorized', message: 'No token provided' }, 401);
      }

      const invitation = await this.teamService.inviteMember(
        teamId,
        auth.userId,
        validated.memberNim,
        token
      );

      return c.json(createResponse(true, 'Invitation sent successfully', invitation), 201);
    } catch (error: any) {
      return handleError(c, error, 'Failed to invite member');
    }
  };

  respondToInvitation = async (c: Context) => {
    try {
      const auth = c.get('auth') as AuthContext;
      const memberId = c.req.param('memberId');
      const body = await c.req.json();
      const validated = respondInvitationSchema.parse(body);

      const result = await this.teamService.respondToInvitation(
        memberId,
        auth.userId,
        validated.accept
      );

      return c.json(createResponse(true, 'Invitation response recorded', result));
    } catch (error: any) {
      return handleError(c, error, 'Failed to respond to invitation');
    }
  };

  getMyTeam = async (c: Context) => {
    try {
      const auth = c.get('auth') as AuthContext;
      const token = c.req.header('Authorization')?.replace('Bearer ', '');

      if (!token) {
        return c.json({ error: 'Unauthorized', message: 'No token provided' }, 401);
      }

      const team = await this.teamService.getMyTeam(auth.userId, token);

      if (!team) {
        return c.json(createResponse(false, 'You are not a member of any team', null), 404);
      }

      return c.json(createResponse(true, 'Team retrieved', team));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get team');
    }
  };

  leaveTeam = async (c: Context) => {
    try {
      const auth = c.get('auth') as AuthContext;

      console.log(`[TeamController.leaveTeam] Request from userId=${auth.userId}`);

      const result = await this.teamService.leaveTeam(auth.userId);

      console.log(`[TeamController.leaveTeam] ✅ Success: Member left team`);
      return c.json(createResponse(true, 'Successfully left the team', result));
    } catch (error: any) {
      console.error(`[TeamController.leaveTeam] ❌ Error:`, error);
      return handleError(c, error, 'Failed to leave team');
    }
  };

  deleteTeam = async (c: Context) => {
    try {
      const auth = c.get('auth') as AuthContext;
      const teamId = c.req.param('teamId');

      const result = await this.teamService.deleteTeam(teamId, auth.userId);

      return c.json(createResponse(true, 'Team deleted successfully', result));
    } catch (error: any) {
      return handleError(c, error, 'Failed to delete team');
    }
  };

  finalizeTeam = async (c: Context) => {
    try {
      const auth = c.get('auth') as AuthContext;
      const teamId = c.req.param('teamId');

      console.log(`[TeamController.finalizeTeam] Request from userId=${auth.userId}, teamId=${teamId}`);

      const result = await this.teamService.finalizeTeam(teamId, auth.userId);

      console.log(`[TeamController.finalizeTeam] ✅ Success: Team finalized`);
      return c.json(createResponse(true, 'Team finalized successfully', result), 200);
    } catch (error: any) {
      console.error(`[TeamController.finalizeTeam] ❌ Error:`, error);
      return handleError(c, error, 'Failed to finalize team');
    }
  };

  getMyInvitations = async (c: Context) => {
    try {
      const auth = c.get('auth') as AuthContext;
      const token = c.req.header('Authorization')?.replace('Bearer ', '');

      if (!token) {
        return c.json({ error: 'Unauthorized', message: 'No token provided' }, 401);
      }

      const invitations = await this.teamService.getMyInvitations(auth.userId, token);

      return c.json(createResponse(true, 'Invitations retrieved', invitations));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get invitations');
    }
  };

  cancelInvitation = async (c: Context) => {
    try {
      const auth = c.get('auth') as AuthContext;
      const invitationId = c.req.param('invitationId');

      const result = await this.teamService.cancelInvitation(invitationId, auth.userId);

      return c.json(createResponse(true, 'Invitation cancelled', result));
    } catch (error: any) {
      return handleError(c, error, 'Failed to cancel invitation');
    }
  };
}
