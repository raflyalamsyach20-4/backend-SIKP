import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { createTeamSchema } from '@/validation/team.validation';
import { zValidator } from '@hono/zod-validator';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import { inviteMemberSchema, respondInvitationSchema } from '@/schemas/team.schema';
import { TeamController } from '@/controllers/team.controller';

/**
 * Team Routes
 * Handles team management endpoints
 */
export const createTeamRoutes = () => {
  const team = new Hono<{ Bindings: CloudflareBindings }>()
    // Apply auth middleware to all team routes
    .use('*', authMiddleware)
    .use('*', mahasiswaOnly)
    .post(
      '/',
      zValidator('json', createTeamSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => new TeamController(c).createTeam()
    )
    .get(
      '/my-teams',
      zValidator('query', emptyQuerySchema),
      async (c) => new TeamController(c).getMyTeams()
    )
    .get(
      '/my-invitations',
      zValidator('query', emptyQuerySchema),
      async (c) => new TeamController(c).getMyInvitations()
    )
    .post(
      '/:teamId/invite',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', inviteMemberSchema),
      async (c) => new TeamController(c).inviteMember()
    )
    .post(
      '/invitations/:memberId/respond',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', respondInvitationSchema),
      async (c) => new TeamController(c).respondToInvitation()
    )
    .post(
      '/invitations/:memberId/cancel',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => new TeamController(c).cancelInvitation()
    )
    .post(
      '/:teamCode/join',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => new TeamController(c).joinTeam()
    )
    .get(
      '/:teamId/members',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => new TeamController(c).getTeamMembers()
    )
    .post(
      '/:teamId/finalize',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => new TeamController(c).finalizeTeam()
    )
    .post(
      '/:teamId/leave',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => new TeamController(c).leaveTeam()
    )
    .post(
      '/:teamId/members/:memberId/remove',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => new TeamController(c).removeMember()
    )
    .post(
      '/:teamId/delete',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => new TeamController(c).deleteTeam()
    )
    .post(
      '/reset',
      zValidator('query', emptyQuerySchema),
      async (c) => new TeamController(c).resetTeam()
    );

  return team;
};
