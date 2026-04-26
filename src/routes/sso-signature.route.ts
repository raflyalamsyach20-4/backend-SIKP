import { Hono } from 'hono';
import { authMiddleware } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { emptyFormSchema, emptyJsonSchema, emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import { SsoSignatureController } from '@/controllers/sso-signature.controller';

export const createSsoSignatureRoutes = () => {
  const profile = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    .get(
      '/manage-url',
      async (c) => {
        const controller = new SsoSignatureController(c);
        return controller.getManageProfileUrl();
      }
    )
    .get(
      '/signature/manage-url',
      async (c) => {
        const controller = new SsoSignatureController(c);
        return controller.getManageSignatureUrl();
      }
    )
    .get(
      '/signature',
      async (c) => {
        const controller = new SsoSignatureController(c);
        return controller.getActive();
      }
    );

  return profile;
};
