import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
import { emptyFormSchema, emptyJsonSchema, emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';

type Variables = {
  container: DIContainer;
};

export const createSsoSignatureRoutes = () => {
  const profile = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    .use('*', authMiddleware)
    .get(
      '/manage-url',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.ssoSignatureController.getManageProfileUrl(c))
    )
    .get(
      '/signature/manage-url',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.ssoSignatureController.getManageSignatureUrl(c))
    )
    .get(
      '/signature',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.ssoSignatureController.getActive(c))
    )
    .post(
      '/signature',
      zValidator('form', emptyFormSchema),
      withContainer((container, c) => container.ssoSignatureController.upload(c))
    )
    .post(
      '/signature/:id/activate',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', emptyJsonSchema),
      withContainer((container, c) => container.ssoSignatureController.activate(c))
    )
    .delete(
      '/signature/:id',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.ssoSignatureController.remove(c))
    );

  return profile;
};
