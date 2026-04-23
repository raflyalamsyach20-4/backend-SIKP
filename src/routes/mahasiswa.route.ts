import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
import { emptyFormSchema, emptyQuerySchema } from '@/schemas/common.schema';
import { updateMahasiswaProfileSchema } from '@/validation';

type Variables = {
  container: DIContainer;
};

export const createMahasiswaProfileRoutes = () => {
  const mahasiswa = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    .use('*', authMiddleware, mahasiswaOnly)
    .get(
      '/dashboard',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.mahasiswaController.dashboard(c))
    )
    .get(
      '/me',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.mahasiswaController.me(c))
    )
    .put(
      '/me/profile',
      zValidator('json', updateMahasiswaProfileSchema),
      withContainer((container, c) => container.mahasiswaController.updateProfile(c))
    )
    .put(
      '/me/esignature',
      zValidator('form', emptyFormSchema),
      withContainer((container, c) => container.mahasiswaController.updateESignature(c))
    )
    .delete(
      '/me/esignature',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.mahasiswaController.deleteESignature(c))
    );

  return mahasiswa;
};
