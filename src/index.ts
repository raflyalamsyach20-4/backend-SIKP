import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

// Configuration
import { errorHandler } from '@/errors'

// Routes
import { createMahasiswaProfileRoutes } from '@/routes/mahasiswa.route'
import { createAuthRoutes } from '@/routes/auth.route'
import { createTeamRoutes } from '@/routes/team.route'
import { createSubmissionRoutes } from '@/routes/submission.route'
import { createTemplateRoutes } from '@/routes/template.route'
import { createUtilRoutes } from '@/routes/utils.route'
import { createResponseLetterRoutes } from '@/routes/response-letter.routes'
import { createSuratKesediaanFallbackRoutes } from '@/routes/surat-kesediaan.route'
import { createSuratPermohonanFallbackRoutes } from '@/routes/surat-permohonan.route'
import { createAssetRoutes } from '@/routes/assets.route'
import { createSsoSignatureRoutes } from '@/routes/sso-signature.route'
import { createDosenRoutes } from './routes/dosen.route'
import { createAdminRoutes } from './routes/admin.route'

// Internship Execution Phase Routes
import { createInternshipRoutes } from '@/routes/internship.route'
import { createLogbookRoutes } from '@/routes/logbook.route'
import { createMentorshipRoutes } from '@/routes/mentorship.route'
import { createInternshipMonitoringRoutes } from '@/routes/internship-monitoring.route'
import { createPenilaianRoutes } from '@/routes/penilaian.route'

/**
 * Main Application
 */
const app = new Hono<{ Bindings: CloudflareBindings }>()

/**
 * Global Middlewares
 */
.use('*', logger())
.use('*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

/**
 * Health Check Endpoints
 */
.get('/', (c) => {
  return c.json({
    success: true,
    message: 'Backend SIKP API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  })
})

.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  })
})

/**
 * API Routes
 */
.route('/api/auth', createAuthRoutes())
.route('/api/teams', createTeamRoutes())
.route('/api/submissions', createSubmissionRoutes())
.route('/api/templates', createTemplateRoutes())
.route('/api/utils', createUtilRoutes())
.route('/api/response-letters', createResponseLetterRoutes())
.route('/api/surat-kesediaan', createSuratKesediaanFallbackRoutes())
.route('/api/surat-permohonan', createSuratPermohonanFallbackRoutes())
.route('/api/assets', createAssetRoutes())
.route('/api/profile', createSsoSignatureRoutes())
.route('/api/mahasiswa', createMahasiswaProfileRoutes())
.route('/api/dosen', createDosenRoutes())
.route('/api/admin', createAdminRoutes())

// Internship & Execution Phase Routes
.route('/api/internships', createInternshipRoutes())
.route('/api/logbooks', createLogbookRoutes())
.route('/api/mentorship', createMentorshipRoutes())
.route('/api/internship-monitoring', createInternshipMonitoringRoutes())
.route('/api/penilaian', createPenilaianRoutes())

/**
 * 404 Not Found Handler
 */
.notFound((c) => {
  return c.json({
    success: false,
    message: 'Route not found',
    path: c.req.path,
  }, 404)
})

/**
 * Global Error Handler
 */
.onError((err, c) => {
  return errorHandler(err, c)
})

export default app
