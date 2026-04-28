import { Hono } from 'hono';
import { authMiddleware } from '@/middlewares/auth.middleware';

export const createPenilaianRoutes = () => {
  const route = new Hono<{ Bindings: CloudflareBindings }>();
  route.use('*', authMiddleware);

  route.get('/kriteria', async (c) => {
    return c.json({
      success: true,
      data: [
        { id: 'kehadiran', label: 'Kehadiran', weight: 0.2 },
        { id: 'kerjasama', label: 'Kerjasama', weight: 0.3 },
        { id: 'sikapEtika', label: 'Sikap & Etika', weight: 0.2 },
        { id: 'prestasiKerja', label: 'Prestasi Kerja', weight: 0.2 },
        { id: 'kreatifitas', label: 'Kreatifitas', weight: 0.1 },
      ]
    });
  });

  return route;
};
