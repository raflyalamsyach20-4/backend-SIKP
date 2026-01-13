import { Hono } from 'hono';
import { TeamController } from '@/controllers/team.controller';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';

export const createTeamRoutes = (teamController: TeamController) => {
  const team = new Hono();

  // Apply auth middleware to all team routes
  team.use('*', authMiddleware);
  team.use('*', mahasiswaOnly);

  team.post('/', teamController.createTeam);
  team.get('/my-teams', teamController.getMyTeams);
  team.post('/:teamId/invite', teamController.inviteMember);
  team.post('/invitations/:memberId/respond', teamController.respondToInvitation);
  team.get('/:teamId/members', teamController.getTeamMembers);

  return team;
};
