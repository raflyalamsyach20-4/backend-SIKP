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

// Routes
import { createAuthRoutes } from '@/routes/auth.route';

// Middlewares
import { authMiddleware, requireMahasiswa, requireAdmin } from '@/middlewares/auth.middleware';

type Bindings = {
  DATABASE_URL: string;
  R2_BUCKET: R2Bucket;
  // SSO Configuration (OAuth 2.0 Identity Gateway)
  SSO_BASE_URL: string;
  SSO_JWKS_URL: string;
  SSO_ISSUER: string;
  SSO_CLIENT_ID: string;
  SSO_CLIENT_SECRET: string;
  SSO_REDIRECT_URI: string;
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
    ssoEnabled: true,
    timestamp: new Date().toISOString(),
  });
});

// Helper function to create services
function createServices(c: any) {
  const db = createDbClient(c.env.DATABASE_URL);
  const teamRepo = new TeamRepository(db);
  const submissionRepo = new SubmissionRepository(db);
  const teamService = new TeamService(teamRepo, c.env.SSO_BASE_URL);
  const storageService = new StorageService(c.env.R2_BUCKET);
  const letterService = new LetterService(submissionRepo, storageService);
  const submissionService = new SubmissionService(submissionRepo, teamRepo, storageService);
  const adminService = new AdminService(submissionRepo, letterService);

  return {
    teamService,
    submissionService,
    adminService,
  };
}

// ============ AUTH ROUTES ============
const authRoutes = new Hono<{ Bindings: Bindings }>();

// OAuth 2.0 - Exchange authorization code for token
authRoutes.post('/exchange', async (c) => {
  const controller = new AuthController(c.env.SSO_BASE_URL);
  return controller.exchange(c);
});

// OAuth 2.0 - Refresh access token
authRoutes.post('/refresh', async (c) => {
  const controller = new AuthController(c.env.SSO_BASE_URL);
  return controller.refresh(c);
});

// Get current user info (with profiles from SSO)
authRoutes.get('/me', authMiddleware(), async (c) => {
  const controller = new AuthController(c.env.SSO_BASE_URL);
  return controller.me(c);
});

app.route('/api/auth', authRoutes);

// ============ TEAM ROUTES ============
const teamRoutes = new Hono<{ Bindings: Bindings }>();

// All team routes require authentication
teamRoutes.use('*', authMiddleware());

// Create team (mahasiswa only)
teamRoutes.post('/', requireMahasiswa(), async (c) => {
  const { teamService } = createServices(c);
  const controller = new TeamController(teamService);
  return controller.createTeam(c);
});

// Get my team
teamRoutes.get('/my-team', async (c) => {
  const { teamService } = createServices(c);
  const controller = new TeamController(teamService);
  return controller.getMyTeam(c);
});

// Get my invitations
teamRoutes.get('/my-invitations', async (c) => {
  const { teamService } = createServices(c);
  const controller = new TeamController(teamService);
  return controller.getMyInvitations(c);
});

// Invite member (leader only, validated in service)
teamRoutes.post('/:teamId/invite', async (c) => {
  const { teamService } = createServices(c);
  const controller = new TeamController(teamService);
  return controller.inviteMember(c);
});

// Respond to invitation
teamRoutes.patch('/members/:memberId/respond', async (c) => {
  const { teamService } = createServices(c);
  const controller = new TeamController(teamService);
  return controller.respondToInvitation(c);
});

// Cancel invitation (leader only)
teamRoutes.delete('/invitations/:invitationId/cancel', async (c) => {
  const { teamService } = createServices(c);
  const controller = new TeamController(teamService);
  return controller.cancelInvitation(c);
});

// Leave team
teamRoutes.delete('/leave', async (c) => {
  const { teamService } = createServices(c);
  const controller = new TeamController(teamService);
  return controller.leaveTeam(c);
});

app.route('/api/teams', teamRoutes);

// ============ SUBMISSION ROUTES ============
const submissionRoutes = new Hono<{ Bindings: Bindings }>();

// All submission routes require authentication
submissionRoutes.use('*', authMiddleware());

// Create/update submission (mahasiswa only, team leader)
submissionRoutes.post('/', requireMahasiswa(), async (c) => {
  const { submissionService } = createServices(c);
  const controller = new SubmissionController(submissionService);
  return controller.createSubmission(c);
});

// Get my submission
submissionRoutes.get('/my-submissions', requireMahasiswa(), async (c) => {
  const { submissionService } = createServices(c);
  const controller = new SubmissionController(submissionService);
  return controller.getMySubmissions(c);
});

// Upload document
submissionRoutes.post('/:submissionId/documents', requireMahasiswa(), async (c) => {
  const { submissionService } = createServices(c);
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
  const { adminService } = createServices(c);
  const controller = new AdminController(adminService);
  return controller.getAllSubmissions(c);
});

// Get submission detail
adminRoutes.get('/submissions/:submissionId', async (c) => {
  const { adminService } = createServices(c);
  const controller = new AdminController(adminService);
  return controller.getSubmissionById(c);
});

// Approve submission
adminRoutes.post('/submissions/:submissionId/approve', async (c) => {
  const { adminService } = createServices(c);
  const controller = new AdminController(adminService);
  return controller.approveSubmission(c);
});

// Reject submission
adminRoutes.post('/submissions/:submissionId/reject', async (c) => {
  const { adminService } = createServices(c);
  const controller = new AdminController(adminService);
  return controller.rejectSubmission(c);
});

// Generate letter
adminRoutes.post('/submissions/:submissionId/generate-letter', async (c) => {
  const { adminService } = createServices(c);
  const controller = new AdminController(adminService);
  return controller.generateLetter(c);
});

app.route('/api/admin', adminRoutes);

export default app;
