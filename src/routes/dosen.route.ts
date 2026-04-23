import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, dosenOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { createDosenSuratKesediaanRoutes } from './surat-kesediaan.route';
import { createDosenSuratPermohonanRoutes } from './surat-permohonan.route';
import { createDosenSuratPengantarRoutes } from './surat-pengantar-dosen.route';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
import { emptyFormSchema, emptyQuerySchema } from '@/schemas/common.schema';
import { updateDosenProfileSchema } from '@/validation';

type Variables = {
  container: DIContainer;
};

export const createDosenRoutes = () => {
  const dosen = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    .use('*', authMiddleware)
    .use('/me/*', dosenOnly)
    .use('/me', dosenOnly)
    .use('/dashboard', dosenOnly)
    .use('/dashboard/wakdek', roleMiddleware(['DOSEN', 'WAKIL_DEKAN']))
    .get(
      '/dashboard',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.dosenController.dashboard(c))
    )
    .get(
      '/dashboard/wakdek',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.dosenController.wakdekDashboard(c))
    )
    .get(
      '/me',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.dosenController.me(c))
    )
    .put(
      '/me/profile',
      zValidator('json', updateDosenProfileSchema),
      withContainer((container, c) => container.dosenController.updateProfile(c))
    )
    .put(
      '/me/esignature',
      zValidator('form', emptyFormSchema),
      withContainer((container, c) => container.dosenController.updateESignature(c))
    )
    .delete(
      '/me/esignature',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.dosenController.deleteESignature(c))
    )
    // Surat Kesediaan Routes (nested)
    .route('/surat-kesediaan', createDosenSuratKesediaanRoutes())
    .route('/surat-permohonan', createDosenSuratPermohonanRoutes())
    .route('/surat-pengantar', createDosenSuratPengantarRoutes());

  return dosen;
};
