import { Hono } from 'hono';
import { authMiddleware } from '@/middlewares/auth.middleware';
import { PenilaianController } from '@/controllers/penilaian.controller';

export const createPenilaianRoutes = () => {
  const route = new Hono<{ Bindings: CloudflareBindings }>();
  
  route.use('*', authMiddleware);

  route.get('/kriteria', async (c) => new PenilaianController(c).getKriteria());
  
  route.get('/recap/:internshipId', async (c) => new PenilaianController(c).getRecap());
  
  route.get('/print/:internshipId', async (c) => new PenilaianController(c).printRecap());
  
  route.get('/kaprodi/pending', async (c) => new PenilaianController(c).getPendingVerifications());
  route.post('/kaprodi/verify/:gradeId', async (c) => new PenilaianController(c).verifyGrade());
  route.get('/admin/pending', async (c) => new PenilaianController(c).getAdminPendingVerifications());
  route.post('/admin/verify/:gradeId', async (c) => new PenilaianController(c).verifyGradeByAdmin());

  return route;
};
