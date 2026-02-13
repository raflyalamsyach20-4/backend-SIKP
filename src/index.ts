import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// Configuration & Core
import { createAppConfig, CloudflareBindings } from '@/config';
import { DIContainer } from '@/core';
import { errorHandler } from '@/errors';

// Middlewares
import { authMiddleware } from '@/middlewares/auth.middleware';

// Routes
import { createAuthRoutes, createMahasiswaRoutes } from '@/routes/auth.route';
import { createTeamRoutes } from '@/routes/team.route';
import { createSubmissionRoutes } from '@/routes/submission.route';
import { createAdminRoutes } from '@/routes/admin.route';
import { createTemplateRoutes } from '@/routes/template.route';
import { createUtilRoutes } from '@/routes/utils.route';
import { createResponseLetterRoutes } from '@/routes/response-letter.routes';

/**
 * Extended context variables
 */
type Variables = {
  container: DIContainer;
};

/**
 * Main Application
 */
const app = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

/**
 * Global Middlewares
 */
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

/**
 * Health Check Endpoints
 */
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

/**
 * Dependency Injection Setup Middleware
 * Initializes DI container for each request with proper configuration
 */
app.use('/api/*', async (c, next) => {
  // Create application configuration from environment bindings
  const config = createAppConfig(c.env);
  
  // Initialize DI container with configuration
  const container = new DIContainer(config);
  
  // Store container in context for route handlers
  c.set('container', container);
  
  await next();
});

/**
 * API Routes
 */
app.route('/api/auth', createAuthRoutes());
app.route('/api/mahasiswa', createMahasiswaRoutes());
app.route('/api/teams', createTeamRoutes());
app.route('/api/submissions', createSubmissionRoutes());
app.route('/api/admin', createAdminRoutes());
app.route('/api/templates', createTemplateRoutes());
app.route('/api/utils', createUtilRoutes());
app.route('/api/response-letters', createResponseLetterRoutes());

/**
 * 404 Not Found Handler
 */
app.notFound((c) => {
  return c.json({
    success: false,
    message: 'Route not found',
    path: c.req.path,
  }, 404);
});

/**
 * Global Error Handler
 */
app.onError((err, c) => {
  return errorHandler(err, c);
});

export default app;

