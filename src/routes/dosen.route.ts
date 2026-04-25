import { Hono } from 'hono';
import { authMiddleware, dosenOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import { createDosenSuratKesediaanRoutes } from './surat-kesediaan.route';
import { createDosenSuratPermohonanRoutes } from './surat-permohonan.route';
import { createDosenSuratPengantarRoutes } from './surat-pengantar-dosen.route';
import { zValidator } from '@hono/zod-validator';
import { emptyFormSchema, emptyQuerySchema } from '@/schemas/common.schema';
import { updateDosenProfileSchema } from '@/validation';
import { DosenController } from '@/controllers/dosen.controller';

export const createDosenRoutes = () => {
  const dosen = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    .use('/me/*', dosenOnly)
    .use('/me', dosenOnly)
    .use('/dashboard', dosenOnly)
    .use('/dashboard/wakdek', roleMiddleware(['dosen', 'wakil_dekan']))
    .get(
      '/dashboard',
      zValidator('query', emptyQuerySchema),
      async (c) => new DosenController(c).dashboard()
    )
    .get(
      '/dashboard/wakdek',
      zValidator('query', emptyQuerySchema),
      async (c) => new DosenController(c).wakdekDashboard()
    )
    .get(
      '/me',
      zValidator('query', emptyQuerySchema),
      async (c) => new DosenController(c).me()
    )
    .put(
      '/me/profile',
      zValidator('json', updateDosenProfileSchema),
      async (c) => new DosenController(c).updateProfile()
    )
    .put(
      '/me/esignature',
      zValidator('form', emptyFormSchema),
      async (c) => new DosenController(c).updateESignature()
    )
    .delete(
      '/me/esignature',
      zValidator('query', emptyQuerySchema),
      async (c) => new DosenController(c).deleteESignature()
    )
    // Surat Kesediaan Routes (nested)
    .route('/surat-kesediaan', createDosenSuratKesediaanRoutes())
    .route('/surat-permohonan', createDosenSuratPermohonanRoutes())
    .route('/surat-pengantar', createDosenSuratPengantarRoutes());

  return dosen;
};
