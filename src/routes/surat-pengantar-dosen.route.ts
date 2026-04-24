import { Hono } from 'hono';
import type { CloudflareBindings } from '@/config';
import { authMiddleware, roleMiddleware } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import { rejectRequestSchema } from '@/schemas/surat-pengantar-dosen.schema';

export const createDosenSuratPengantarRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware, roleMiddleware(['DOSEN', 'WAKIL_DEKAN']))
    .get(
      '/requests',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPengantarDosenController.getRequests, runtime.suratPengantarDosenController, [c, c.req.valid('query')]);
      }
    )
    .put(
      '/requests/:requestId/approve',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPengantarDosenController.approve, runtime.suratPengantarDosenController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    .put(
      '/requests/:requestId/reject',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', rejectRequestSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.suratPengantarDosenController.reject, runtime.suratPengantarDosenController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    );

  return routes;
};