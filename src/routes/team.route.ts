import { Hono } from 'hono';
import { TeamController } from '@/controllers/team.controller';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';

export const createTeamRoutes = (teamController: TeamController) => {
  const team = new Hono();

  // Apply auth middleware to all team routes
  team.use('*', authMiddleware());
  team.use('*', mahasiswaOnly());

  team.post('/', teamController.createTeam);
  team.get('/my-team', teamController.getMyTeam);
  team.get('/my-invitations', teamController.getMyInvitations);
  team.post('/:teamId/invite', teamController.inviteMember);
  team.patch('/members/:memberId/respond', teamController.respondToInvitation);
  team.delete('/leave', teamController.leaveTeam);
  team.delete('/invitations/:invitationId/cancel', teamController.cancelInvitation);
  team.delete('/:teamId', teamController.deleteTeam);
  team.put('/:teamId/finalize', teamController.finalizeTeam);

  return team;
};
