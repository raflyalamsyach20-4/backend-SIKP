import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createDbClient } from '@/db';

// Repositories
import { UserRepository } from '@/repositories/user.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';

// Services
import { AuthService } from '@/services/auth.service';
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
import { createTeamRoutes } from '@/routes/team.route';
import { createSubmissionRoutes } from '@/routes/submission.route';
import { createAdminRoutes } from '@/routes/admin.route';

type Bindings = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  R2_BUCKET: R2Bucket;
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
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Initialize routes with proper dependency injection
app.use('/api/*', async (c, next) => {
  // Initialize database
  const db = createDbClient(c.env.DATABASE_URL);

  // Initialize repositories
  const userRepo = new UserRepository(db);
  const teamRepo = new TeamRepository(db);
  const submissionRepo = new SubmissionRepository(db);

  // Initialize services
  const authService = new AuthService(userRepo, c.env.JWT_SECRET);
  const teamService = new TeamService(teamRepo, userRepo);
  const storageService = new StorageService(c.env.R2_BUCKET);
  const letterService = new LetterService(submissionRepo, storageService);
  const submissionService = new SubmissionService(submissionRepo, teamRepo, storageService);
  const adminService = new AdminService(submissionRepo, letterService);

  // Store services in context
  c.set('authService', authService);
  c.set('teamService', teamService);
  c.set('submissionService', submissionService);
  c.set('adminService', adminService);

  await next();
});

// Mount routes
app.route('/api/auth', (() => {
  const route = new Hono<{ Bindings: Bindings }>();
  
  route.post('/register/mahasiswa', async (c) => {
    const authService = c.get('authService') as AuthService;
    const controller = new AuthController(authService);
    return controller.registerMahasiswa(c);
  });

  route.post('/register/admin', async (c) => {
    const authService = c.get('authService') as AuthService;
    const controller = new AuthController(authService);
    return controller.registerAdmin(c);
  });

  route.post('/register/dosen', async (c) => {
    const authService = c.get('authService') as AuthService;
    const controller = new AuthController(authService);
    return controller.registerDosen(c);
  });

  route.post('/login', async (c) => {
    const authService = c.get('authService') as AuthService;
    const controller = new AuthController(authService);
    return controller.login(c);
  });

  route.get('/me', async (c) => {
    const authService = c.get('authService') as AuthService;
    const controller = new AuthController(authService);
    return controller.me(c);
  });

  return route;
})());

app.route('/api/teams', (() => {
  const route = new Hono<{ Bindings: Bindings }>();
  
  const getController = (c: any) => {
    const teamService = c.get('teamService') as TeamService;
    return new TeamController(teamService);
  };

  route.post('/', async (c) => getController(c).createTeam(c));
  route.get('/my-teams', async (c) => getController(c).getMyTeams(c));
  route.post('/:teamId/invite', async (c) => getController(c).inviteMember(c));
  route.post('/invitations/:memberId/respond', async (c) => getController(c).respondToInvitation(c));
  route.get('/:teamId/members', async (c) => getController(c).getTeamMembers(c));

  return route;
})());

app.route('/api/submissions', (() => {
  const route = new Hono<{ Bindings: Bindings }>();
  
  const getController = (c: any) => {
    const submissionService = c.get('submissionService') as SubmissionService;
    return new SubmissionController(submissionService);
  };

  route.post('/', async (c) => getController(c).createSubmission(c));
  route.get('/my-submissions', async (c) => getController(c).getMySubmissions(c));
  route.get('/:submissionId', async (c) => getController(c).getSubmissionById(c));
  route.patch('/:submissionId', async (c) => getController(c).updateSubmission(c));
  route.post('/:submissionId/submit', async (c) => getController(c).submitForReview(c));
  route.post('/:submissionId/documents', async (c) => getController(c).uploadDocument(c));
  route.get('/:submissionId/documents', async (c) => getController(c).getDocuments(c));

  return route;
})());

app.route('/api/admin', (() => {
  const route = new Hono<{ Bindings: Bindings }>();
  
  const getController = (c: any) => {
    const adminService = c.get('adminService') as AdminService;
    return new AdminController(adminService);
  };

  route.get('/submissions', async (c) => getController(c).getAllSubmissions(c));
  route.get('/submissions/status/:status', async (c) => getController(c).getSubmissionsByStatus(c));
  route.get('/submissions/:submissionId', async (c) => getController(c).getSubmissionById(c));
  route.post('/submissions/:submissionId/approve', async (c) => getController(c).approveSubmission(c));
  route.post('/submissions/:submissionId/reject', async (c) => getController(c).rejectSubmission(c));
  route.post('/submissions/:submissionId/generate-letter', async (c) => getController(c).generateLetter(c));
  route.get('/statistics', async (c) => getController(c).getStatistics(c));

  return route;
})());

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    message: 'Route not found',
    path: c.req.path,
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Global error:', err);
  return c.json({
    success: false,
    message: err.message || 'Internal server error',
  }, 500);
});

export default app;

