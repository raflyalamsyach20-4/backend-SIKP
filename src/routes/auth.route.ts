import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { createMahasiswaSuratKesediaanRoutes } from './surat-kesediaan.route';
import { createMahasiswaSuratPermohonanRoutes } from './surat-permohonan.route';

/**
 * Extended context variables
 */
type Variables = {
  container: DIContainer;
};

/**
 * Auth Routes
 * Handles authentication-related endpoints
 */
export const createAuthRoutes = () => {
  const auth = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  // Legacy routes (disabled by controller)
  auth.post('/register/mahasiswa', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.registerMahasiswa(c);
  });

  auth.post('/register/admin', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.registerAdmin(c);
  });

  auth.post('/register/dosen', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.registerDosen(c);
  });

  auth.post('/login', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.login(c);
  });

  auth.post('/prepare', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.prepare(c);
  });

  // SSO callback route
  auth.post('/callback', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.callback(c);
  });

  // Protected SSO routes
  auth.get('/me', authMiddleware, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.me(c);
  });

  auth.get('/identities', authMiddleware, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.identities(c);
  });

  auth.post('/select-identity', authMiddleware, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.selectIdentity(c);
  });

  auth.post('/logout', authMiddleware, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.logout(c);
  });

  return auth;
};

/**
 * Mahasiswa Routes
 * Handles mahasiswa search endpoint
 */
export const createMahasiswaRoutes = () => {
  const mahasiswa = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  mahasiswa.use('*', authMiddleware);

  mahasiswa.get('/search', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.searchMahasiswa(c);
  });

  mahasiswa.route('/surat-kesediaan', createMahasiswaSuratKesediaanRoutes());
  mahasiswa.route('/surat-permohonan', createMahasiswaSuratPermohonanRoutes());

  mahasiswa.get('/submissions/:submissionId/letter-request-status', mahasiswaOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.submissionController.getLetterRequestStatus(c);
  });

  return mahasiswa;
};
