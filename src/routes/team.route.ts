import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { createTeamSchema } from '@/validation/team.validation';
import { zValidator } from '@hono/zod-validator';

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

  .post('/', zValidator("json", createTeamSchema), async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.createTeam(c);
  })

  .get('/my-teams', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.getMyTeams(c);
  })

  .get('/my-invitations', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.getMyInvitations(c);
  })

  .post('/:teamId/invite', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.inviteMember(c);
  })

  .post('/invitations/:memberId/respond', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.respondToInvitation(c);
  })

  .post('/invitations/:memberId/cancel', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.cancelInvitation(c);
  })

  .post('/:teamCode/join', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.joinTeam(c);
  })

  .get('/:teamId/members', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.getTeamMembers(c);
  })

  .post('/:teamId/finalize', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.finalizeTeam(c);
  })

  .post('/:teamId/leave', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.leaveTeam(c);
  })

  .post('/:teamId/members/:memberId/remove', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.removeMember(c);
  })

  .post('/:teamId/delete', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.deleteTeam(c);
  })

  /**
   * Student: Reset team (delete submissions and reset to PENDING)
   * POST /api/teams/reset
   * Auth: Required (Mahasiswa only)
   */
  .post('/reset', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.resetTeam(c);
  })

  return team;
};
