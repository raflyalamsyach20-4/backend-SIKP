import { Hono } from 'hono';
import { authMiddleware, dosenOnly, roleMiddleware } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { createDosenSuratKesediaanRoutes } from './surat-kesediaan.route';
import { createDosenSuratPermohonanRoutes } from './surat-permohonan.route';
import { createDosenSuratPengantarRoutes } from './surat-pengantar-dosen.route';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyFormSchema, emptyQuerySchema } from '@/schemas/common.schema';
import { updateDosenProfileSchema } from '@/validation';

export const createDosenRoutes = () => {
  const dosen = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    .use('/me/*', dosenOnly)
    .use('/me', dosenOnly)
    .use('/dashboard', dosenOnly)
    .use('/dashboard/wakdek', roleMiddleware(['DOSEN', 'WAKIL_DEKAN']))
    .get(
      '/dashboard',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.dosenController.dashboard, runtime.dosenController, [c, c.req.valid('query')]);
      }
    )
    .get(
      '/dashboard/wakdek',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.dosenController.wakdekDashboard, runtime.dosenController, [c, c.req.valid('query')]);
      }
    )
    .get(
      '/me',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.dosenController.me, runtime.dosenController, [c, c.req.valid('query')]);
      }
    )
    .put(
      '/me/profile',
      zValidator('json', updateDosenProfileSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.dosenController.updateProfile, runtime.dosenController, [c, c.req.valid('json')]);
      }
    )
    .put(
      '/me/esignature',
      zValidator('form', emptyFormSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.dosenController.updateESignature, runtime.dosenController, [c, c.req.valid('form')]);
      }
    )
    .delete(
      '/me/esignature',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.dosenController.deleteESignature, runtime.dosenController, [c, c.req.valid('query')]);
      }
    )
    // Surat Kesediaan Routes (nested)
    .route('/surat-kesediaan', createDosenSuratKesediaanRoutes())
    .route('/surat-permohonan', createDosenSuratPermohonanRoutes())
    .route('/surat-pengantar', createDosenSuratPengantarRoutes());

  return dosen;
};
