import { Context, Hono } from 'hono';
import { DIContainer } from '@/core';
import { CloudflareBindings } from '@/config';
import { authMiddleware, roleMiddleware } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import { rejectRequestSchema } from '@/schemas/surat-pengantar-dosen.schema';

type Variables = {
  container: DIContainer;
};

export const createDosenSuratPengantarRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    .use('*', authMiddleware, roleMiddleware(['DOSEN', 'WAKIL_DEKAN']))
    .get(
      '/requests',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.suratPengantarDosenController.getRequests(c))
    )
    .put(
      '/requests/:requestId/approve',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.suratPengantarDosenController.approve(c))
    )
    .put(
      '/requests/:requestId/reject',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectRequestSchema),
      withContainer((container, c) => container.suratPengantarDosenController.reject(c))
    );

  return routes;
};