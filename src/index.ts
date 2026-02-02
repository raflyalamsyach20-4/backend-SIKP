import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createDbClient } from '@/db';

// Repositories
import { UserRepository } from '@/repositories/user.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { TemplateRepository } from '@/repositories/template.repository';

// Services
import { AuthService } from '@/services/auth.service';
import { TeamService } from '@/services/team.service';
import { SubmissionService } from '@/services/submission.service';
import { AdminService } from '@/services/admin.service';
import { StorageService } from '@/services/storage.service';
import { MockR2Bucket } from '@/services/mock-r2-bucket';
import { LetterService } from '@/services/letter.service';
import { TemplateService } from '@/services/template.service';

// Controllers
import { AuthController } from '@/controllers/auth.controller';
import { TeamController } from '@/controllers/team.controller';
import { SubmissionController } from '@/controllers/submission.controller';
import { AdminController } from '@/controllers/admin.controller';
import { TemplateController } from '@/controllers/template.controller';

// Middlewares (MOVED TO TOP - must be imported before use)
import { authMiddleware, mahasiswaOnly, adminOnly } from '@/middlewares/auth.middleware';

// Routes
import { createAuthRoutes } from '@/routes/auth.route';
import { createTeamRoutes } from '@/routes/team.route';
import { createSubmissionRoutes } from '@/routes/submission.route';
import { createAdminRoutes } from '@/routes/admin.route';
import { createTemplateRoutes } from '@/routes/template.route';

type Bindings = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  R2_BUCKET: R2Bucket;
  R2_DOMAIN: string;
  R2_BUCKET_NAME: string;
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
  
  // ✅ Require real R2 bucket binding in production; only allow mock when explicitly enabled
  const useMockR2Env = (c.env as any).USE_MOCK_R2;
  const useMockR2 = useMockR2Env === true || useMockR2Env === 'true';
  const r2BucketOrMock = useMockR2 ? new MockR2Bucket('document-sikp-mi') : c.env.R2_BUCKET;

  const storageService = new StorageService(
    r2BucketOrMock as any,
    c.env.R2_DOMAIN as string,
    c.env.R2_BUCKET_NAME as string
  );
  const letterService = new LetterService(submissionRepo, storageService);
  const submissionService = new SubmissionService(submissionRepo, teamRepo, storageService);
  const adminService = new AdminService(submissionRepo, letterService);

  // Store services and repositories in context
  c.set('authService', authService);
  c.set('teamService', teamService);
  c.set('submissionService', submissionService);
  c.set('adminService', adminService);
  c.set('userRepo', userRepo);

  await next();
});

// Mount routes
app.route('/api/auth', (() => {
  const route = new Hono<{ Bindings: Bindings }>();
  
  route.post('/register/mahasiswa', async (c) => {
    const authService = c.get('authService') as AuthService;
    const userRepo = c.get('userRepo') as UserRepository;
    const controller = new AuthController(authService, userRepo);
    return controller.registerMahasiswa(c);
  });

  route.post('/register/admin', async (c) => {
    const authService = c.get('authService') as AuthService;
    const userRepo = c.get('userRepo') as UserRepository;
    const controller = new AuthController(authService, userRepo);
    return controller.registerAdmin(c);
  });

  route.post('/register/dosen', async (c) => {
    const authService = c.get('authService') as AuthService;
    const userRepo = c.get('userRepo') as UserRepository;
    const controller = new AuthController(authService, userRepo);
    return controller.registerDosen(c);
  });

  route.post('/login', async (c) => {
    const authService = c.get('authService') as AuthService;
    const userRepo = c.get('userRepo') as UserRepository;
    const controller = new AuthController(authService, userRepo);
    return controller.login(c);
  });

  // Protected route - requires authentication
  route.get('/me', authMiddleware, async (c) => {
    const authService = c.get('authService') as AuthService;
    const userRepo = c.get('userRepo') as UserRepository;
    const controller = new AuthController(authService, userRepo);
    return controller.me(c);
  });

  return route;
})());

app.route('/api/mahasiswa', (() => {
  const route = new Hono<{ Bindings: Bindings }>();
  
  // Apply auth middleware to all mahasiswa routes
  route.use('*', authMiddleware);
  
  route.get('/search', async (c) => {
    const authService = c.get('authService') as AuthService;
    const userRepo = c.get('userRepo') as UserRepository;
    const controller = new AuthController(authService, userRepo);
    return controller.searchMahasiswa(c);
  });

  return route;
})());

app.route('/api/teams', (() => {
  const route = new Hono<{ Bindings: Bindings }>();
  
  // Apply auth middleware to all team routes
  route.use('*', authMiddleware);
  route.use('*', mahasiswaOnly);
  
  const getController = (c: any) => {
    const teamService = c.get('teamService') as TeamService;
    return new TeamController(teamService);
  };

  route.post('/', async (c) => getController(c).createTeam(c));
  route.get('/my-teams', async (c) => getController(c).getMyTeams(c));
  route.get('/my-invitations', async (c) => getController(c).getMyInvitations(c));
  route.post('/:teamId/invite', async (c) => getController(c).inviteMember(c));
  route.post('/invitations/:memberId/respond', async (c) => getController(c).respondToInvitation(c));
  route.post('/invitations/:memberId/cancel', async (c) => getController(c).cancelInvitation(c));
  route.post('/:teamCode/join', async (c) => getController(c).joinTeam(c));
  route.get('/:teamId/members', async (c) => getController(c).getTeamMembers(c));
  route.post('/:teamId/finalize', async (c) => getController(c).finalizeTeam(c));
  route.post('/:teamId/leave', async (c) => getController(c).leaveTeam(c));
  route.post('/:teamId/members/:memberId/remove', async (c) => getController(c).removeMember(c));
  route.post('/:teamId/delete', async (c) => getController(c).deleteTeam(c));

  return route;
})());

app.route('/api/submissions', (() => {
  const route = new Hono<{ Bindings: Bindings }>();
  
  // Apply auth middleware to all submission routes
  route.use('*', authMiddleware);
  route.use('*', mahasiswaOnly);
  
  const getController = (c: any) => {
    const submissionService = c.get('submissionService') as SubmissionService;
    return new SubmissionController(submissionService);
  };

  route.post('/', async (c) => getController(c).createSubmission(c));
  route.get('/my-submissions', async (c) => getController(c).getMySubmissions(c));
  route.get('/:submissionId', async (c) => getController(c).getSubmissionById(c));
  route.put('/:submissionId', async (c) => getController(c).updateSubmission(c));
  route.patch('/:submissionId', async (c) => getController(c).updateSubmission(c));
  route.post('/:submissionId/submit', async (c) => getController(c).submitForReview(c));
  route.post('/:submissionId/documents', async (c) => getController(c).uploadDocument(c));
  route.get('/:submissionId/documents', async (c) => getController(c).getDocuments(c));

  return route;
})());

app.route('/api/admin', (() => {
  const route = new Hono<{ Bindings: Bindings }>();
  
  // Apply auth middleware to all admin routes
  route.use('*', authMiddleware);
  route.use('*', adminOnly);
  
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

app.route('/api/templates', (() => {
  const route = new Hono<{ Bindings: Bindings }>();
  
  // Apply auth middleware to all template routes
  route.use('*', authMiddleware);
  
  const getController = (c: any) => {
    const db = createDbClient(c.env.DATABASE_URL);
    const useMockR2Env = (c.env as any).USE_MOCK_R2;
    const useMockR2 = useMockR2Env === true || useMockR2Env === 'true';
    const r2BucketOrMock = useMockR2 ? new MockR2Bucket('document-sikp-mi') : c.env.R2_BUCKET;
    
    return new TemplateController(
      db, 
      {
        R2Bucket: r2BucketOrMock as any,
        s3Client: undefined,
      },
      c.env.R2_DOMAIN,
      c.env.R2_BUCKET_NAME
    );
  };

  // Public read routes (specific paths first)
  route.get('/active', async (c) => getController(c).getActive(c));
  route.get('/', async (c) => getController(c).getAll(c));
  
  // Admin-only write routes
  route.post('/', adminOnly, async (c) => getController(c).create(c));
  route.put('/:id', adminOnly, async (c) => getController(c).update(c));
  route.delete('/:id', adminOnly, async (c) => getController(c).delete(c));
  route.patch('/:id/toggle-active', adminOnly, async (c) => getController(c).toggleActive(c));
  
  // Public read routes (by ID and download)
  route.get('/:id/download', async (c) => getController(c).download(c));
  route.get('/:id', async (c) => getController(c).getById(c));

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

