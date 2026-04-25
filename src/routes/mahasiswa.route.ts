import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { MahasiswaController } from '@/controllers/mahasiswa.controller';

export const createMahasiswaProfileRoutes = () => {
  return new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware, mahasiswaOnly)
    .get('/dashboard', (c) => new MahasiswaController(c).dashboard())
    .get('/me', (c) => new MahasiswaController(c).me())
    .get('/search', (c) => new MahasiswaController(c).search())
    .put('/me/profile', (c) => new MahasiswaController(c).updateProfile())
    .put('/me/esignature', (c) => new MahasiswaController(c).updateESignature())
    .delete('/me/esignature', (c) => new MahasiswaController(c).deleteESignature());
};
