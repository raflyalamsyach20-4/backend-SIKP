import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly, dosenOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import {
  requestSuratKesediaanSchema,
  reapplyRequestSchema,
  rejectRequestSchema,
  approveBulkSchema,
} from '@/schemas/surat-kesediaan.schema';

/**
 * Create Mahasiswa Surat Kesediaan Routes
 * Mount at /api/mahasiswa/surat-kesediaan
 */
export const createMahasiswaSuratKesediaanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware, mahasiswaOnly)
    // POST /api/mahasiswa/surat-kesediaan/requests
    .post(
      '/requests',
      zValidator('json', requestSuratKesediaanSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratKesediaanController.requestSuratKesediaan, runtime.suratKesediaanController, [c, c.req.valid('json')]);
      }
    )
    // PUT /api/mahasiswa/surat-kesediaan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratKesediaanController.reapplyRequest, runtime.suratKesediaanController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    );

  return routes;
};

/**
 * Create global fallback routes for backward compatibility.
 * Mount at /api/surat-kesediaan
 */
export const createSuratKesediaanFallbackRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware, mahasiswaOnly)
    // POST /api/surat-kesediaan/requests
    .post(
      '/requests',
      zValidator('json', requestSuratKesediaanSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratKesediaanController.requestSuratKesediaan, runtime.suratKesediaanController, [c, c.req.valid('json')]);
      }
    )
    // PUT /api/surat-kesediaan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratKesediaanController.reapplyRequest, runtime.suratKesediaanController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    // POST /api/surat-kesediaan/request
    .post(
      '/request',
      zValidator('json', requestSuratKesediaanSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratKesediaanController.requestSuratKesediaan, runtime.suratKesediaanController, [c, c.req.valid('json')]);
      }
    );

  return routes;
};

/**
 * Create Dosen Surat Kesediaan Routes
 * Mount at /api/dosen/surat-kesediaan
 */
export const createDosenSuratKesediaanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    // GET /api/dosen/surat-kesediaan/requests
    .get(
      '/requests',
      roleMiddleware(['DOSEN', 'WAKIL_DEKAN']),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratKesediaanController.getRequests, runtime.suratKesediaanController, [c, c.req.valid('query')]);
      }
    )
    // PUT /api/dosen/surat-kesediaan/requests/:requestId/approve
    .put(
      '/requests/:requestId/approve',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratKesediaanController.approveSingle, runtime.suratKesediaanController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    // PUT /api/dosen/surat-kesediaan/requests/:requestId/reject
    .put(
      '/requests/:requestId/reject',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectRequestSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratKesediaanController.reject, runtime.suratKesediaanController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    // PUT /api/dosen/surat-kesediaan/requests/approve-bulk
    .put(
      '/requests/approve-bulk',
      dosenOnly,
      zValidator('json', approveBulkSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratKesediaanController.approveBulk, runtime.suratKesediaanController, [c, c.req.valid('json')]);
      }
    );

  return routes;
};
