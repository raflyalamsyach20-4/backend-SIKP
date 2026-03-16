import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, mahasiswaOnly, dosenOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';

type Variables = {
  container: DIContainer;
};

/**
 * Create Mahasiswa Surat Kesediaan Routes
 * Mount at /api/mahasiswa/surat-kesediaan
 */
export const createMahasiswaSuratKesediaanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  routes.use('*', authMiddleware, mahasiswaOnly);

  // POST /api/mahasiswa/surat-kesediaan/requests
  routes.post('/requests', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratKesediaanController.requestSuratKesediaan(c);
  });

  // PUT /api/mahasiswa/surat-kesediaan/requests/:requestId/reapply
  routes.put('/requests/:requestId/reapply', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratKesediaanController.reapplyRequest(c);
  });

  return routes;
};

/**
 * Create global fallback routes for backward compatibility.
 * Mount at /api/surat-kesediaan
 */
export const createSuratKesediaanFallbackRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  routes.use('*', authMiddleware, mahasiswaOnly);

  // POST /api/surat-kesediaan/requests
  routes.post('/requests', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratKesediaanController.requestSuratKesediaan(c);
  });

  // PUT /api/surat-kesediaan/requests/:requestId/reapply
  routes.put('/requests/:requestId/reapply', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratKesediaanController.reapplyRequest(c);
  });

  // POST /api/surat-kesediaan/request
  routes.post('/request', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratKesediaanController.requestSuratKesediaan(c);
  });

  return routes;
};

/**
 * Create Dosen Surat Kesediaan Routes
 * Mount at /api/dosen/surat-kesediaan
 */
export const createDosenSuratKesediaanRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  routes.use('*', authMiddleware, dosenOnly);

  // GET /api/dosen/surat-kesediaan/requests
  routes.get('/requests', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratKesediaanController.getRequests(c);
  });

  // PUT /api/dosen/surat-kesediaan/requests/:requestId/approve
  routes.put('/requests/:requestId/approve', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratKesediaanController.approveSingle(c);
  });

  // PUT /api/dosen/surat-kesediaan/requests/:requestId/reject
  routes.put('/requests/:requestId/reject', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratKesediaanController.reject(c);
  });

  // PUT /api/dosen/surat-kesediaan/requests/approve-bulk
  routes.put('/requests/approve-bulk', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.suratKesediaanController.approveBulk(c);
  });

  return routes;
};
