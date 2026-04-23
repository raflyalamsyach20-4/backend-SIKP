import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { createTeamSchema } from '@/validation/team.validation';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import { inviteMemberSchema, respondInvitationSchema } from '@/schemas/team.schema';

/**
 * Extended context variables
 */
type Variables = {
  container: DIContainer;
};

/**
 * Team Routes
 * Handles team management endpoints
 */
export const createTeamRoutes = () => {
  const team = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    // Apply auth middleware to all team routes
    .use('*', authMiddleware)
    .use('*', mahasiswaOnly)
    .post(
      '/',
      zValidator('json', createTeamSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.teamController.createTeam(c))
    )
    .get(
      '/my-teams',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.teamController.getMyTeams(c))
    )
    .get(
      '/my-invitations',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.teamController.getMyInvitations(c))
    )
    .post(
      '/:teamId/invite',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', inviteMemberSchema),
      withContainer((container, c) => container.teamController.inviteMember(c))
    )
    .post(
      '/invitations/:memberId/respond',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', respondInvitationSchema),
      withContainer((container, c) => container.teamController.respondToInvitation(c))
    )
    .post(
      '/invitations/:memberId/cancel',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.teamController.cancelInvitation(c))
    )
    .post(
      '/:teamCode/join',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.teamController.joinTeam(c))
    )
    .get(
      '/:teamId/members',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.teamController.getTeamMembers(c))
    )
    .post(
      '/:teamId/finalize',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.teamController.finalizeTeam(c))
    )
    .post(
      '/:teamId/leave',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.teamController.leaveTeam(c))
    )
    .post(
      '/:teamId/members/:memberId/remove',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.teamController.removeMember(c))
    )
    .post(
      '/:teamId/delete',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.teamController.deleteTeam(c))
    )

  /**
   * Student: Reset team (delete submissions and reset to PENDING)
   * POST /api/teams/reset
   * Auth: Required (Mahasiswa only)
   */
    .post(
      '/reset',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.teamController.resetTeam(c))
    );

  return team;
};
