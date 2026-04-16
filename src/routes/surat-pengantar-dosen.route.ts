import { Context, Hono } from 'hono';
import { DIContainer } from '@/core';
import { CloudflareBindings } from '@/config';
import { authMiddleware, roleMiddleware } from '@/middlewares/auth.middleware';

type Variables = {
  container: DIContainer;
};

export const createDosenSuratPengantarRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  routes.use('*', authMiddleware, roleMiddleware(['DOSEN', 'WAKIL_DEKAN']));

  routes.get('/requests', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPengantarDosenController.getRequests(c);
  });

  routes.put('/requests/:requestId/approve', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPengantarDosenController.approve(c);
  });

  routes.put('/requests/:requestId/reject', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPengantarDosenController.reject(c);
  });

  return routes;
};