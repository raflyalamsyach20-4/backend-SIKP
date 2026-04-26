import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import { rejectRequestSchema } from '@/schemas/surat-pengantar-dosen.schema';
import { SuratPengantarDosenController } from '@/controllers';

export const createDosenSuratPengantarRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware, roleMiddleware(['dosen', 'wakil_dekan']))
    .get(
      '/requests',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SuratPengantarDosenController(c).getRequests();
      }
    )
    .put(
      '/requests/:requestId/approve',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new SuratPengantarDosenController(c).approve();
      }
    )
    .put(
      '/requests/:requestId/reject',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectRequestSchema),
      async (c) => {
        return new SuratPengantarDosenController(c).reject();
      }
    );

  return routes;
};