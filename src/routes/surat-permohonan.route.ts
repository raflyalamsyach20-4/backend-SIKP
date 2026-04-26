import { Hono } from 'hono';
import { authMiddleware, dosenOnly, mahasiswaOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import {
  requestSuratPermohonanSchema,
  reapplyRequestSchema,
  approveBulkSchema,
  rejectRequestSchema,
} from '@/schemas/surat-permohonan.schema';
import { SuratPermohonanController } from '@/controllers';

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
        return new SuratPermohonanController(c).requestSuratPermohonan();
      }
    )
    // PUT /api/mahasiswa/surat-permohonan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        return new SuratPermohonanController(c).reapplyRequest();
      }
    )
    .patch(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        return new SuratPermohonanController(c).reapplyRequest();
      }
    )
    .post(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        return new SuratPermohonanController(c).reapplyRequest();
      }
    )
    .post(
      '/request',
      zValidator('json', requestSuratPermohonanSchema),
      async (c) => {
        return new SuratPermohonanController(c).requestSuratPermohonan();
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
        return new SuratPermohonanController(c).requestSuratPermohonan();
      }
    )
    // PUT /api/surat-permohonan/requests/:requestId/reapply
    .put(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        return new SuratPermohonanController(c).reapplyRequest();
      }
    )
    .patch(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        return new SuratPermohonanController(c).reapplyRequest();
      }
    )
    .post(
      '/requests/:requestId/reapply',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', reapplyRequestSchema),
      async (c) => {
        return new SuratPermohonanController(c).reapplyRequest();
      }
    )
    .post(
      '/request',
      zValidator('json', requestSuratPermohonanSchema),
      async (c) => {
        return new SuratPermohonanController(c).requestSuratPermohonan();
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
        return new SuratPermohonanController(c).getRequests();
      }
    )
    .put(
      '/requests/:requestId/approve',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SuratPermohonanController(c).approveSingle();
      }
    )
    .put(
      '/requests/approve-bulk',
      dosenOnly,
      zValidator('json', approveBulkSchema),
      async (c) => {
        return new SuratPermohonanController(c).approveBulk();
      }
    )
    .put(
      '/requests/:requestId/reject',
      dosenOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectRequestSchema),
      async (c) => {
        return new SuratPermohonanController(c).reject();
      }
    );

  return routes;
};
