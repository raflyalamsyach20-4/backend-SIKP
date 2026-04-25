import { Hono } from 'hono';
import { authMiddleware, dosenOnly, mahasiswaOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import {
  requestSuratPermohonanSchema,
  reapplyRequestSchema,
  approveBulkSchema,
  rejectRequestSchema,
} from '@/schemas/surat-permohonan.schema';

/**
 * Mount at /api/mahasiswa/surat-permohonan
 */
export const createMahasiswaSuratPermohonanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware, mahasiswaOnly)
    .post(
      '/requests',
      zValidator('json', requestSuratPermohonanSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.requestSuratPermohonan, runtime.suratPermohonanController, [c, c.req.valid('json')]);
      }
    )
    // PUT /api/mahasiswa/surat-permohonan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.reapplyRequest, runtime.suratPermohonanController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    .patch(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.reapplyRequest, runtime.suratPermohonanController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    .post(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.reapplyRequest, runtime.suratPermohonanController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    .post(
      '/request',
      zValidator('json', requestSuratPermohonanSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.requestSuratPermohonan, runtime.suratPermohonanController, [c, c.req.valid('json')]);
      }
    );

  return routes;
};

/**
 * Backward compatibility fallback.
 * Mount at /api/surat-permohonan
 */
export const createSuratPermohonanFallbackRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware, mahasiswaOnly)
    .post(
      '/requests',
      zValidator('json', requestSuratPermohonanSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.requestSuratPermohonan, runtime.suratPermohonanController, [c, c.req.valid('json')]);
      }
    )
    // PUT /api/surat-permohonan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.reapplyRequest, runtime.suratPermohonanController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    .patch(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.reapplyRequest, runtime.suratPermohonanController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    .post(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.reapplyRequest, runtime.suratPermohonanController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    .post(
      '/request',
      zValidator('json', requestSuratPermohonanSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.requestSuratPermohonan, runtime.suratPermohonanController, [c, c.req.valid('json')]);
      }
    );

  return routes;
};

/**
 * Mount at /api/dosen/surat-permohonan
 */
export const createDosenSuratPermohonanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    .get(
      '/requests',
      roleMiddleware(['dosen', 'wakil_dekan']),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.getRequests, runtime.suratPermohonanController, [c, c.req.valid('query')]);
      }
    )
    .put(
      '/requests/:requestId/approve',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.approveSingle, runtime.suratPermohonanController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    .put(
      '/requests/approve-bulk',
      dosenOnly,
      zValidator('json', approveBulkSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.approveBulk, runtime.suratPermohonanController, [c, c.req.valid('json')]);
      }
    )
    .put(
      '/requests/:requestId/reject',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectRequestSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPermohonanController.reject, runtime.suratPermohonanController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    );

  return routes;
};
