import { Context, Hono } from 'hono';
import { DIContainer } from '@/core';
import { CloudflareBindings } from '@/config';
import { authMiddleware, dosenOnly, mahasiswaOnly, roleMiddleware } from '@/middlewares/auth.middleware';

type Variables = {
  container: DIContainer;
};

/**
 * Mount at /api/mahasiswa/surat-permohonan
 */
export const createMahasiswaSuratPermohonanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  routes.use('*', authMiddleware, mahasiswaOnly);

  routes.post('/requests', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.requestSuratPermohonan(c);
  });

  // PUT /api/mahasiswa/surat-permohonan/requests/:requestId/reapply
  routes.put('/requests/:requestId/reapply', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.reapplyRequest(c);
  });

  routes.patch('/requests/:requestId/reapply', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.reapplyRequest(c);
  });

  routes.post('/requests/:requestId/reapply', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.reapplyRequest(c);
  });

  routes.post('/request', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.requestSuratPermohonan(c);
  });

  return routes;
};

/**
 * Backward compatibility fallback.
 * Mount at /api/surat-permohonan
 */
export const createSuratPermohonanFallbackRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  routes.use('*', authMiddleware, mahasiswaOnly);

  routes.post('/requests', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.requestSuratPermohonan(c);
  });

  // PUT /api/surat-permohonan/requests/:requestId/reapply
  routes.put('/requests/:requestId/reapply', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.reapplyRequest(c);
  });

  routes.patch('/requests/:requestId/reapply', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.reapplyRequest(c);
  });

  routes.post('/requests/:requestId/reapply', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.reapplyRequest(c);
  });

  routes.post('/request', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.requestSuratPermohonan(c);
  });

  return routes;
};

/**
 * Mount at /api/dosen/surat-permohonan
 */
export const createDosenSuratPermohonanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  routes.use('*', authMiddleware);

  routes.get('/requests', roleMiddleware(['DOSEN', 'WAKIL_DEKAN']), async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.getRequests(c);
  });

  routes.put('/requests/:requestId/approve', dosenOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.approveSingle(c);
  });

  routes.put('/requests/approve-bulk', dosenOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.approveBulk(c);
  });

  routes.put('/requests/:requestId/reject', dosenOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratPermohonanController.reject(c);
  });

  return routes;
};
