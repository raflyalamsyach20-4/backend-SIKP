import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';

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
  const team = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  // Apply auth middleware to all team routes
  team.use('*', authMiddleware);
  team.use('*', mahasiswaOnly);

  team.post('/', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.createTeam(c);
  });

  team.get('/my-teams', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.getMyTeams(c);
  });

  team.get('/my-invitations', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.getMyInvitations(c);
  });

  team.post('/:teamId/invite', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.inviteMember(c);
  });

  team.post('/invitations/:memberId/respond', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.respondToInvitation(c);
  });

  team.post('/invitations/:memberId/cancel', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.cancelInvitation(c);
  });

  team.post('/:teamCode/join', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.joinTeam(c);
  });

  team.get('/:teamId/members', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.getTeamMembers(c);
  });

  team.post('/:teamId/finalize', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.finalizeTeam(c);
  });

  team.post('/:teamId/leave', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.leaveTeam(c);
  });

  team.post('/:teamId/members/:memberId/remove', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.removeMember(c);
  });

  team.post('/:teamId/delete', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.teamController.deleteTeam(c);
  });

  return team;
};
