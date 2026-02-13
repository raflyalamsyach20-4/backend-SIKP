import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';

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

  // Public routes
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

  // Protected routes
  auth.get('/me', authMiddleware, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.authController.me(c);
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

  return mahasiswa;
};
