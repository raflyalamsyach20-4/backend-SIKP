import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { createMahasiswaSuratKesediaanRoutes } from './surat-kesediaan.route';
import { createMahasiswaSuratPermohonanRoutes } from './surat-permohonan.route';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
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
 * Auth Routes
 * Handles authentication-related endpoints
 */
export const createAuthRoutes = () => {
  const auth = new Hono<{ Bindings: CloudflareBindings }>()
    // Legacy routes (disabled by controller)
    .post(
      '/register/mahasiswa',
      zValidator('json', emptyJsonSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.authController.registerMahasiswa, runtime.authController, [c, c.req.valid('json')]);
      }
    )
    .post(
      '/register/admin',
      zValidator('json', emptyJsonSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.authController.registerAdmin, runtime.authController, [c, c.req.valid('json')]);
      }
    )
    .post(
      '/register/dosen',
      zValidator('json', emptyJsonSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.authController.registerDosen, runtime.authController, [c, c.req.valid('json')]);
      }
    )
    .post(
      '/login',
      zValidator('json', emptyJsonSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.authController.login, runtime.authController, [c, c.req.valid('json')]);
      }
    )
    .post(
      '/prepare',
      zValidator('json', authPrepareSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.authController.prepare, runtime.authController, [c, c.req.valid('json')]);
      }
    )
    // SSO callback route
    .post(
      '/callback',
      zValidator('json', authCallbackSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.authController.callback, runtime.authController, [c, c.req.valid('json')]);
      }
    )
    // Protected SSO routes
    .get(
      '/me',
      authMiddleware,
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.authController.me, runtime.authController, [c, c.req.valid('query')]);
      }
    )
    .get(
      '/identities',
      authMiddleware,
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.authController.identities, runtime.authController, [c, c.req.valid('query')]);
      }
    )
    .post(
      '/select-identity',
      authMiddleware,
      zValidator('json', selectIdentitySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.authController.selectIdentity, runtime.authController, [c, c.req.valid('json')]);
      }
    )
    .post(
      '/logout',
      authMiddleware,
      zValidator('json', emptyJsonSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.authController.logout, runtime.authController, [c, c.req.valid('json')]);
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
    .get(
      '/search',
      zValidator('query', searchMahasiswaQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.authController.searchMahasiswa, runtime.authController, [c, c.req.valid('query')]);
      }
    )
    .route('/surat-kesediaan', createMahasiswaSuratKesediaanRoutes())
    .route('/surat-permohonan', createMahasiswaSuratPermohonanRoutes())
    .get(
      '/submissions/:submissionId/letter-request-status',
      mahasiswaOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.submissionController.getLetterRequestStatus, runtime.submissionController, [
          c,
          c.req.valid('param'),
          c.req.valid('query'),
        ]);
      }
    );

  return mahasiswa;
};
