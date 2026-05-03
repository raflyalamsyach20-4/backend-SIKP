import { Hono } from 'hono';
import { authMiddleware } from '@/middlewares/auth.middleware';
import { PenilaianController } from '@/controllers/penilaian.controller';

export const createPenilaianRoutes = () => {
  const route = new Hono<{ Bindings: CloudflareBindings }>();
  
  route.use('*', authMiddleware);

  route.get('/kriteria', async (c) => new PenilaianController(c).getKriteria());
  
  route.get('/recap/:internshipId', async (c) => new PenilaianController(c).getRecap());
  
  route.get('/print/:internshipId', async (c) => new PenilaianController(c).printRecap());

  return route;
};
