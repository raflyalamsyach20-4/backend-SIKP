import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, mahasiswaOnly, dosenOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import {
  requestSuratKesediaanSchema,
  reapplyRequestSchema,
  rejectRequestSchema,
  approveBulkSchema,
} from '@/schemas/surat-kesediaan.schema';

type Variables = {
  container: DIContainer;
};

/**
 * Create Mahasiswa Surat Kesediaan Routes
 * Mount at /api/mahasiswa/surat-kesediaan
 */
export const createMahasiswaSuratKesediaanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    .use('*', authMiddleware, mahasiswaOnly)
    // POST /api/mahasiswa/surat-kesediaan/requests
    .post(
      '/requests',
      zValidator('json', requestSuratKesediaanSchema),
      withContainer((container, c) => container.suratKesediaanController.requestSuratKesediaan(c))
    )
    // PUT /api/mahasiswa/surat-kesediaan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      withContainer((container, c) => container.suratKesediaanController.reapplyRequest(c))
    );

  return routes;
};

/**
 * Create global fallback routes for backward compatibility.
 * Mount at /api/surat-kesediaan
 */
export const createSuratKesediaanFallbackRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    .use('*', authMiddleware, mahasiswaOnly)
    // POST /api/surat-kesediaan/requests
    .post(
      '/requests',
      zValidator('json', requestSuratKesediaanSchema),
      withContainer((container, c) => container.suratKesediaanController.requestSuratKesediaan(c))
    )
    // PUT /api/surat-kesediaan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      withContainer((container, c) => container.suratKesediaanController.reapplyRequest(c))
    )
    // POST /api/surat-kesediaan/request
    .post(
      '/request',
      zValidator('json', requestSuratKesediaanSchema),
      withContainer((container, c) => container.suratKesediaanController.requestSuratKesediaan(c))
    );

  return routes;
};

/**
 * Create Dosen Surat Kesediaan Routes
 * Mount at /api/dosen/surat-kesediaan
 */
export const createDosenSuratKesediaanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    .use('*', authMiddleware)
    // GET /api/dosen/surat-kesediaan/requests
    .get(
      '/requests',
      roleMiddleware(['DOSEN', 'WAKIL_DEKAN']),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.suratKesediaanController.getRequests(c))
    )
    // PUT /api/dosen/surat-kesediaan/requests/:requestId/approve
    .put(
      '/requests/:requestId/approve',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.suratKesediaanController.approveSingle(c))
    )
    // PUT /api/dosen/surat-kesediaan/requests/:requestId/reject
    .put(
      '/requests/:requestId/reject',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectRequestSchema),
      withContainer((container, c) => container.suratKesediaanController.reject(c))
    )
    // PUT /api/dosen/surat-kesediaan/requests/approve-bulk
    .put(
      '/requests/approve-bulk',
      dosenOnly,
      zValidator('json', approveBulkSchema),
      withContainer((container, c) => container.suratKesediaanController.approveBulk(c))
    );

  return routes;
};
