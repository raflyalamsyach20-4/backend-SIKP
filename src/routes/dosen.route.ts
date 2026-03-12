import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, dosenOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { createDosenSuratKesediaanRoutes } from './surat-kesediaan.route';

type Variables = {
  container: DIContainer;
};

export const createDosenRoutes = () => {
  const dosen = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  dosen.use('*', authMiddleware, dosenOnly);

  dosen.get('/me', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.dosenController.me(c);
  });

  dosen.put('/me/profile', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.dosenController.updateProfile(c);
  });

  dosen.put('/me/esignature', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.dosenController.updateESignature(c);
  });

  dosen.delete('/me/esignature', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.dosenController.deleteESignature(c);
  });

  // Surat Kesediaan Routes (nested)
  dosen.route('/surat-kesediaan', createDosenSuratKesediaanRoutes());

  return dosen;
};
