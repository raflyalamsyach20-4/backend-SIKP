import { Hono } from 'hono';
import { authMiddleware } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyFormSchema, emptyJsonSchema, emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';

export const createSsoSignatureRoutes = () => {
  const profile = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    .get(
      '/manage-url',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.ssoSignatureController.getManageProfileUrl, runtime.ssoSignatureController, [c, c.req.valid('query')]);
      }
    )
    .get(
      '/signature/manage-url',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.ssoSignatureController.getManageSignatureUrl, runtime.ssoSignatureController, [c, c.req.valid('query')]);
      }
    )
    .get(
      '/signature',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.ssoSignatureController.getActive, runtime.ssoSignatureController, [c, c.req.valid('query')]);
      }
    )
    .post(
      '/signature',
      zValidator('form', emptyFormSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.ssoSignatureController.upload, runtime.ssoSignatureController, [c, c.req.valid('form')]);
      }
    )
    .post(
      '/signature/:id/activate',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('json', emptyJsonSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.ssoSignatureController.activate, runtime.ssoSignatureController, [c, c.req.valid('param'), c.req.valid('json')]);
      }
    )
    .delete(
      '/signature/:id',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.ssoSignatureController.remove, runtime.ssoSignatureController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    );

  return profile;
};
