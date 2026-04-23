import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { createMahasiswaSuratKesediaanRoutes } from './surat-kesediaan.route';
import { createMahasiswaSuratPermohonanRoutes } from './surat-permohonan.route';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
import {
  authCallbackSchema,
  authPrepareSchema,
  selectIdentitySchema,
} from '@/validation';
import {
  emptyJsonSchema,
  emptyQuerySchema,
  nonEmptyStringParamsSchema,
  searchMahasiswaQuerySchema,
} from '@/schemas/common.schema';

/**
 * Extended context variables
 */
type Variables = {
  container: DIContainer;
};

/**
 * Auth Routes
 * Handles authentication-related endpoints
 */
export const createAuthRoutes = () => {
  const auth = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    // Legacy routes (disabled by controller)
    .post(
      '/register/mahasiswa',
      zValidator('json', emptyJsonSchema),
      withContainer((container, c) => container.authController.registerMahasiswa(c))
    )
    .post(
      '/register/admin',
      zValidator('json', emptyJsonSchema),
      withContainer((container, c) => container.authController.registerAdmin(c))
    )
    .post(
      '/register/dosen',
      zValidator('json', emptyJsonSchema),
      withContainer((container, c) => container.authController.registerDosen(c))
    )
    .post(
      '/login',
      zValidator('json', emptyJsonSchema),
      withContainer((container, c) => container.authController.login(c))
    )
    .post(
      '/prepare',
      zValidator('json', authPrepareSchema),
      withContainer((container, c) => container.authController.prepare(c))
    )
    // SSO callback route
    .post(
      '/callback',
      zValidator('json', authCallbackSchema),
      withContainer((container, c) => container.authController.callback(c))
    )
    // Protected SSO routes
    .get(
      '/me',
      authMiddleware,
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.authController.me(c))
    )
    .get(
      '/identities',
      authMiddleware,
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.authController.identities(c))
    )
    .post(
      '/select-identity',
      authMiddleware,
      zValidator('json', selectIdentitySchema),
      withContainer((container, c) => container.authController.selectIdentity(c))
    )
    .post(
      '/logout',
      authMiddleware,
      zValidator('json', emptyJsonSchema),
      withContainer((container, c) => container.authController.logout(c))
    );

  return auth;
};

/**
 * Mahasiswa Routes
 * Handles mahasiswa search endpoint
 */
export const createMahasiswaRoutes = () => {
  const mahasiswa = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    .use('*', authMiddleware)
    .get(
      '/search',
      zValidator('query', searchMahasiswaQuerySchema),
      withContainer((container, c) => container.authController.searchMahasiswa(c))
    )
    .route('/surat-kesediaan', createMahasiswaSuratKesediaanRoutes())
    .route('/surat-permohonan', createMahasiswaSuratPermohonanRoutes())
    .get(
      '/submissions/:submissionId/letter-request-status',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.submissionController.getLetterRequestStatus(c))
    );

  return mahasiswa;
};
