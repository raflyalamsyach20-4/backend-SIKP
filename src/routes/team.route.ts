import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { createTeamSchema } from '@/validation/team.validation';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import { inviteMemberSchema, respondInvitationSchema } from '@/schemas/team.schema';

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
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.createTeam, runtime.teamController, [c, c.req.valid('json'), c.req.valid('query')]);
      }
    )
    .get(
      '/my-teams',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.getMyTeams, runtime.teamController, [c, c.req.valid('query')]);
      }
    )
    .get(
      '/my-invitations',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.getMyInvitations, runtime.teamController, [c, c.req.valid('query')]);
      }
    )
    .post(
      '/:teamId/invite',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', inviteMemberSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.inviteMember, runtime.teamController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    .post(
      '/invitations/:memberId/respond',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', respondInvitationSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.respondToInvitation, runtime.teamController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    .post(
      '/invitations/:memberId/cancel',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.cancelInvitation, runtime.teamController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    .post(
      '/:teamCode/join',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.joinTeam, runtime.teamController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    .get(
      '/:teamId/members',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.getTeamMembers, runtime.teamController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    .post(
      '/:teamId/finalize',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.finalizeTeam, runtime.teamController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    .post(
      '/:teamId/leave',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.leaveTeam, runtime.teamController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    .post(
      '/:teamId/members/:memberId/remove',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.removeMember, runtime.teamController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    .post(
      '/:teamId/delete',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.deleteTeam, runtime.teamController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )

  /**
   * Student: Reset team (delete submissions and reset to PENDING)
   * POST /api/teams/reset
   * Auth: Required (Mahasiswa only)
   */
    .post(
      '/reset',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.teamController.resetTeam, runtime.teamController, [c, c.req.valid('query')]);
      }
    );

  return team;
};
