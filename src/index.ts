import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// Configuration
import type { CloudflareBindings } from '@/config';
import { errorHandler } from '@/errors';

// Routes
import { createAuthRoutes } from '@/routes/auth.route';
import { createTeamRoutes } from '@/routes/team.route';
import { createSubmissionRoutes } from '@/routes/submission.route';
import { createTemplateRoutes } from '@/routes/template.route';
import { createUtilRoutes } from '@/routes/utils.route';
import { createResponseLetterRoutes } from '@/routes/response-letter.routes';
import { createSuratKesediaanFallbackRoutes } from '@/routes/surat-kesediaan.route';
import { createSuratPermohonanFallbackRoutes } from '@/routes/surat-permohonan.route';
import { createAssetRoutes } from '@/routes/assets.route';
import { createSsoSignatureRoutes } from '@/routes/sso-signature.route';

/**
 * Main Application
 */
const app = new Hono<{ Bindings: CloudflareBindings }>();

/**
 * Global Middlewares
 */
app.use('*', logger());
app.use('*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
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
 * API Routes
 */
app.route('/api/auth', createAuthRoutes());
app.route('/api/teams', createTeamRoutes());
app.route('/api/submissions', createSubmissionRoutes());
app.route('/api/templates', createTemplateRoutes());
app.route('/api/utils', createUtilRoutes());
app.route('/api/response-letters', createResponseLetterRoutes());
app.route('/api/surat-kesediaan', createSuratKesediaanFallbackRoutes());
app.route('/api/surat-permohonan', createSuratPermohonanFallbackRoutes());
app.route('/api/assets', createAssetRoutes());
app.route('/api/profile', createSsoSignatureRoutes());

const legacyIdentityRouteGone = (c: Context) => {
  return c.json({
    success: false,
    message: 'This legacy identity route has been removed in SSO big-bang cutover.',
  }, 410);
};

app.all('/api/mahasiswa', legacyIdentityRouteGone);
app.all('/api/mahasiswa/*', legacyIdentityRouteGone);
app.all('/api/dosen', legacyIdentityRouteGone);
app.all('/api/dosen/*', legacyIdentityRouteGone);
app.all('/api/admin', legacyIdentityRouteGone);
app.all('/api/admin/*', legacyIdentityRouteGone);

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

