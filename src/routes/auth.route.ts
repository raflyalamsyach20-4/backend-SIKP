import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { createMahasiswaSuratKesediaanRoutes } from './surat-kesediaan.route';
import { createMahasiswaSuratPermohonanRoutes } from './surat-permohonan.route';
import { zValidator } from '@hono/zod-validator';
import {
  authCallbackSchema,
  authPrepareSchema,
  selectIdentitySchema,
} from '@/validation';
import {
  emptyJsonSchema,
  emptyQuerySchema,
  nonEmptyStringParamsSchema,
} from '@/schemas/common.schema';
import { AuthController, SubmissionController } from '@/controllers';

/**
 * Auth Routes
 * Handles authentication-related endpoints
 */
export const createAuthRoutes = () => {
  const auth = new Hono<{ Bindings: CloudflareBindings }>()
    // SSO flows
    .post(
      '/prepare',
      zValidator('json', authPrepareSchema),
      async (c) => {
        const data = c.req.valid('json');

        const auth = new AuthController(c);
        return auth.prepare(data);
      }
    )
    // SSO callback route
    .post(
      '/callback',
      zValidator('json', authCallbackSchema),
      async (c) => {
        const data = c.req.valid('json');

        const auth = new AuthController(c);
        return auth.callback(data);
      }
    )
    // Protected SSO routes
    .get(
      '/me',
      authMiddleware,
      async (c) => {
        const auth = new AuthController(c);
        return auth.me();
      }
    )
    .get(
      '/identities',
      authMiddleware,
      async (c) => {
        const auth = new AuthController(c);
        return auth.identities();
      }
    )
    .post(
      '/select-identity',
      authMiddleware,
      zValidator('json', selectIdentitySchema),
      async (c) => {
        const data = c.req.valid('json');

        const auth = new AuthController(c);
        return auth.selectIdentity(data);
      }
    )
    .post(
      '/logout',
      authMiddleware,
      zValidator('json', emptyJsonSchema),
      async (c) => {
        const auth = new AuthController(c);
        return auth.logout();
      }
    );

  return auth;
};

/**
 * Mahasiswa Routes
 * Handles mahasiswa search endpoint
 */
export const createMahasiswaRoutes = () => {
  const mahasiswa = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    .route('/surat-kesediaan', createMahasiswaSuratKesediaanRoutes())
    .route('/surat-permohonan', createMahasiswaSuratPermohonanRoutes())
    .get(
      '/submissions/:submissionId/letter-request-status',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const submissionController = new SubmissionController(c);
        return submissionController.getLetterRequestStatus();
      }
    );

  return mahasiswa;
};
