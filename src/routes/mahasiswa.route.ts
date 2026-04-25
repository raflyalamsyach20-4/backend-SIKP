import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyFormSchema, emptyQuerySchema } from '@/schemas/common.schema';
import { updateMahasiswaProfileSchema } from '@/validation';

export const createMahasiswaProfileRoutes = () => {
  const mahasiswa = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware, mahasiswaOnly)
    .get(
      '/dashboard',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.mahasiswaController.dashboard, runtime.mahasiswaController, [c, c.req.valid('query')]);
      }
    )
    .get(
      '/me',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.mahasiswaController.me, runtime.mahasiswaController, [c, c.req.valid('query')]);
      }
    )
    .put(
      '/me/profile',
      zValidator('json', updateMahasiswaProfileSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.mahasiswaController.updateProfile, runtime.mahasiswaController, [c, c.req.valid('json')]);
      }
    )
    .put(
      '/me/esignature',
      zValidator('form', emptyFormSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.mahasiswaController.updateESignature, runtime.mahasiswaController, [c, c.req.valid('form')]);
      }
    )
    .delete(
      '/me/esignature',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.mahasiswaController.deleteESignature, runtime.mahasiswaController, [c, c.req.valid('query')]);
      }
    );

  return mahasiswa;
};
