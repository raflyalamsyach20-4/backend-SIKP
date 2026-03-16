import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';

type Variables = {
  container: DIContainer;
};

export const createMahasiswaProfileRoutes = () => {
  const mahasiswa = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  mahasiswa.use('*', authMiddleware, mahasiswaOnly);

  mahasiswa.get('/me', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.mahasiswaController.me(c);
  });

  mahasiswa.put('/me/profile', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.mahasiswaController.updateProfile(c);
  });

  mahasiswa.put('/me/esignature', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.mahasiswaController.updateESignature(c);
  });

  mahasiswa.delete('/me/esignature', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.mahasiswaController.deleteESignature(c);
  });

  return mahasiswa;
};
