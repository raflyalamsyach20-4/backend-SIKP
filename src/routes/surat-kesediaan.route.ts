import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly, dosenOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import {
  requestSuratKesediaanSchema,
  reapplyRequestSchema,
  rejectRequestSchema,
  approveBulkSchema,
} from '@/schemas/surat-kesediaan.schema';
import { SuratKesediaanController } from '@/controllers';

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
        return new SuratKesediaanController(c).requestSuratKesediaan();
      }
    )
    // PUT /api/mahasiswa/surat-kesediaan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        return new SuratKesediaanController(c).reapplyRequest();
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
        return new SuratKesediaanController(c).requestSuratKesediaan();
      }
    )
    // PUT /api/surat-kesediaan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        return new SuratKesediaanController(c).reapplyRequest();
      }
    )
    // POST /api/surat-kesediaan/request
    .post(
      '/request',
      zValidator('json', requestSuratKesediaanSchema),
      async (c) => {
        return new SuratKesediaanController(c).requestSuratKesediaan();
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
      roleMiddleware(['dosen', 'wakil_dekan']),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SuratKesediaanController(c).getRequests();
      }
    )
    // PUT /api/dosen/surat-kesediaan/requests/:requestId/approve
    .put(
      '/requests/:requestId/approve',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SuratKesediaanController(c).approveSingle();
      }
    )
    // PUT /api/dosen/surat-kesediaan/requests/:requestId/reject
    .put(
      '/requests/:requestId/reject',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectRequestSchema),
      async (c) => {
        return new SuratKesediaanController(c).reject();
      }
    )
    // PUT /api/dosen/surat-kesediaan/requests/approve-bulk
    .put(
      '/requests/approve-bulk',
      dosenOnly,
      zValidator('json', approveBulkSchema),
      async (c) => {
        return new SuratKesediaanController(c).approveBulk();
      }
    );

  return routes;
};
