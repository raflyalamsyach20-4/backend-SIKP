import { Context, Hono } from 'hono';
import { DIContainer } from '@/core';
import { CloudflareBindings } from '@/config';
import { authMiddleware, dosenOnly, mahasiswaOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import {
  requestSuratPermohonanSchema,
  reapplyRequestSchema,
  approveBulkSchema,
  rejectRequestSchema,
} from '@/schemas/surat-permohonan.schema';

type Variables = {
  container: DIContainer;
};

/**
 * Mount at /api/mahasiswa/surat-permohonan
 */
export const createMahasiswaSuratPermohonanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    .use('*', authMiddleware, mahasiswaOnly)
    .post(
      '/requests',
      zValidator('json', requestSuratPermohonanSchema),
      withContainer((container, c) => container.suratPermohonanController.requestSuratPermohonan(c))
    )
    // PUT /api/mahasiswa/surat-permohonan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      withContainer((container, c) => container.suratPermohonanController.reapplyRequest(c))
    )
    .patch(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      withContainer((container, c) => container.suratPermohonanController.reapplyRequest(c))
    )
    .post(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      withContainer((container, c) => container.suratPermohonanController.reapplyRequest(c))
    )
    .post(
      '/request',
      zValidator('json', requestSuratPermohonanSchema),
      withContainer((container, c) => container.suratPermohonanController.requestSuratPermohonan(c))
    );

  return routes;
};

/**
 * Backward compatibility fallback.
 * Mount at /api/surat-permohonan
 */
export const createSuratPermohonanFallbackRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    .use('*', authMiddleware, mahasiswaOnly)
    .post(
      '/requests',
      zValidator('json', requestSuratPermohonanSchema),
      withContainer((container, c) => container.suratPermohonanController.requestSuratPermohonan(c))
    )
    // PUT /api/surat-permohonan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      withContainer((container, c) => container.suratPermohonanController.reapplyRequest(c))
    )
    .patch(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      withContainer((container, c) => container.suratPermohonanController.reapplyRequest(c))
    )
    .post(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      withContainer((container, c) => container.suratPermohonanController.reapplyRequest(c))
    )
    .post(
      '/request',
      zValidator('json', requestSuratPermohonanSchema),
      withContainer((container, c) => container.suratPermohonanController.requestSuratPermohonan(c))
    );

  return routes;
};

/**
 * Mount at /api/dosen/surat-permohonan
 */
export const createDosenSuratPermohonanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    .use('*', authMiddleware)
    .get(
      '/requests',
      roleMiddleware(['DOSEN', 'WAKIL_DEKAN']),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.suratPermohonanController.getRequests(c))
    )
    .put(
      '/requests/:requestId/approve',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.suratPermohonanController.approveSingle(c))
    )
    .put(
      '/requests/approve-bulk',
      dosenOnly,
      zValidator('json', approveBulkSchema),
      withContainer((container, c) => container.suratPermohonanController.approveBulk(c))
    )
    .put(
      '/requests/:requestId/reject',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectRequestSchema),
      withContainer((container, c) => container.suratPermohonanController.reject(c))
    );

  return routes;
};
