import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createDbClient } from '@/db';

// Repositories
import { TeamRepository } from '@/repositories/team.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';

// Services
import { TeamService } from '@/services/team.service';
import { SubmissionService } from '@/services/submission.service';
import { AdminService } from '@/services/admin.service';
import { StorageService } from '@/services/storage.service';
import { LetterService } from '@/services/letter.service';

// Controllers
import { AuthController } from '@/controllers/auth.controller';
import { TeamController } from '@/controllers/team.controller';
import { SubmissionController } from '@/controllers/submission.controller';
import { AdminController } from '@/controllers/admin.controller';

// Utils
import { ProfileServiceClient } from '@/utils/profile-service';

// Middlewares
import { authMiddleware, requireMahasiswa, requireAdmin } from '@/middlewares/auth.middleware';

type Bindings = {
  DATABASE_URL: string;
  R2_BUCKET: R2Bucket;
  // Auth Service Configuration
  AUTH_ISSUER: string;
  AUTH_JWKS_URL: string;
  AUTH_AUDIENCE: string;
  // Profile Service Configuration
  PROFILE_SERVICE_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Middlewares
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/', (c) => {
  return c.json({
    success: true,
    message: 'Backend SIKP API is running',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    ssoEnabled: true,
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Initialize services for all API routes
app.use('/api/*', async (c, next) => {
  // Initialize database
  const db = createDbClient(c.env.DATABASE_URL);

  // Initialize repositories
  const teamRepo = new TeamRepository(db);
  const submissionRepo = new SubmissionRepository(db);

  // Initialize Profile Service Client
  const profileService = new ProfileServiceClient(c.env.PROFILE_SERVICE_URL);

  // Initialize services
  const teamService = new TeamService(teamRepo, profileService);
  const storageService = new StorageService(c.env.R2_BUCKET);
  const letterService = new LetterService(submissionRepo, storageService);
  const submissionService = new SubmissionService(submissionRepo, teamRepo, storageService);
  const adminService = new AdminService(submissionRepo, letterService);

  // Store services in context for use in route handlers
  c.set('profileService', profileService as any);
  c.set('teamService', teamService as any);
  c.set('submissionService', submissionService as any);
  c.set('adminService', adminService as any);

  await next();
});

// ============ AUTH ROUTES ============
const authRoutes = new Hono<{ Bindings: Bindings }>();

// Get current user info (with profiles from Profile Service)
authRoutes.get('/me', authMiddleware(), async (c) => {
  const profileService = c.get('profileService') as ProfileServiceClient;
  const controller = new AuthController(profileService);
  return controller.me(c);
});

app.route('/api/auth', authRoutes);

// ============ TEAM ROUTES ============
const teamRoutes = new Hono<{ Bindings: Bindings }>();

// All team routes require authentication
teamRoutes.use('*', authMiddleware());

// Create team (mahasiswa only)
teamRoutes.post('/', requireMahasiswa(), async (c) => {
  const teamService = c.get('teamService') as TeamService;
  const controller = new TeamController(teamService);
  return controller.createTeam(c);
});

// Get my team
teamRoutes.get('/my-team', async (c) => {
  const teamService = c.get('teamService') as TeamService;
  const controller = new TeamController(teamService);
  return controller.getMyTeam(c);
});

// Get my invitations
teamRoutes.get('/my-invitations', async (c) => {
  const teamService = c.get('teamService') as TeamService;
  const controller = new TeamController(teamService);
  return controller.getMyInvitations(c);
});

// Invite member (leader only, validated in service)
teamRoutes.post('/:teamId/invite', async (c) => {
  const teamService = c.get('teamService') as TeamService;
  const controller = new TeamController(teamService);
  return controller.inviteMember(c);
});

// Respond to invitation
teamRoutes.patch('/members/:memberId/respond', async (c) => {
  const teamService = c.get('teamService') as TeamService;
  const controller = new TeamController(teamService);
  return controller.respondToInvitation(c);
});

// Cancel invitation (leader only)
teamRoutes.delete('/members/:memberId/cancel', async (c) => {
  const teamService = c.get('teamService') as TeamService;
  const controller = new TeamController(teamService);
  return controller.cancelInvitation(c);
});

// Leave team
teamRoutes.post('/:teamId/leave', async (c) => {
  const teamService = c.get('teamService') as TeamService;
  const controller = new TeamController(teamService);
  return controller.leaveTeam(c);
});

// Finalize team (leader only)
teamRoutes.post('/:teamId/finalize', async (c) => {
  const teamService = c.get('teamService') as TeamService;
  const controller = new TeamController(teamService);
  return controller.finalizeTeam(c);
});

// Delete team (leader only)
teamRoutes.delete('/:teamId', async (c) => {
  const teamService = c.get('teamService') as TeamService;
  const controller = new TeamController(teamService);
  return controller.deleteTeam(c);
});

app.route('/api/teams', teamRoutes);

// ============ SUBMISSION ROUTES ============
const submissionRoutes = new Hono<{ Bindings: Bindings }>();

// All submission routes require authentication
submissionRoutes.use('*', authMiddleware());

// Create/update submission (mahasiswa only, team leader)
submissionRoutes.post('/', requireMahasiswa(), async (c) => {
  const submissionService = c.get('submissionService') as SubmissionService;
  const controller = new SubmissionController(submissionService);
  return controller.createSubmission(c);
});

// Get my submission
submissionRoutes.get('/my-submission', requireMahasiswa(), async (c) => {
  const submissionService = c.get('submissionService') as SubmissionService;
  const controller = new SubmissionController(submissionService);
  return controller.getMySubmissions(c);
});

// Upload document
submissionRoutes.post('/:submissionId/documents', requireMahasiswa(), async (c) => {
  const submissionService = c.get('submissionService') as SubmissionService;
  const controller = new SubmissionController(submissionService);
  return controller.uploadDocument(c);
});

app.route('/api/submissions', submissionRoutes);

// ============ ADMIN ROUTES ============
const adminRoutes = new Hono<{ Bindings: Bindings }>();

// All admin routes require authentication and admin role
adminRoutes.use('*', authMiddleware());
adminRoutes.use('*', requireAdmin());

// List all submissions
adminRoutes.get('/submissions', async (c) => {
  const adminService = c.get('adminService') as AdminService;
  const controller = new AdminController(adminService);
  return controller.getAllSubmissions(c);
});

// Get submission detail
adminRoutes.get('/submissions/:submissionId', async (c) => {
  const adminService = c.get('adminService') as AdminService;
  const controller = new AdminController(adminService);
  return controller.getSubmission(c);
});

// Approve submission
adminRoutes.post('/submissions/:submissionId/approve', async (c) => {
  const adminService = c.get('adminService') as AdminService;
  const controller = new AdminController(adminService);
  return controller.approveSubmission(c);
});

// Reject submission
adminRoutes.post('/submissions/:submissionId/reject', async (c) => {
  const adminService = c.get('adminService') as AdminService;
  const controller = new AdminController(adminService);
  return controller.rejectSubmission(c);
});

// Generate letter
adminRoutes.post('/submissions/:submissionId/generate-letter', async (c) => {
  const adminService = c.get('adminService') as AdminService;
  const controller = new AdminController(adminService);
  return controller.generateLetter(c);
});

app.route('/api/admin', adminRoutes);

export default app;
