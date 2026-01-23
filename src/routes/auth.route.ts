import { Hono } from 'hono';
import { AuthController } from '@/controllers/auth.controller';
import { authMiddleware } from '@/middlewares/auth.middleware';

export const createAuthRoutes = (authController: AuthController) => {
  const auth = new Hono();

  auth.post('/register/mahasiswa', authController.registerMahasiswa);
  auth.post('/register/admin', authController.registerAdmin);
  auth.post('/register/dosen', authController.registerDosen);
  auth.post('/login', authController.login);
  auth.get('/me', authMiddleware, authController.me);

  return auth;
};

export const createMahasiswaRoutes = (authController: AuthController) => {
  const mahasiswa = new Hono();

  mahasiswa.get('/search', authMiddleware, authController.searchMahasiswa);

  return mahasiswa;
};
