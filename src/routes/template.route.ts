import { Hono } from 'hono';
import { authMiddleware, adminOnly } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyFormSchema, emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';

/**
 * Template Routes
 * Handles template management endpoints
 */
export const createTemplateRoutes = () => {
  const router = new Hono<{ Bindings: CloudflareBindings }>()
    // Apply auth middleware to all template routes
    .use('*', authMiddleware)
    // Public read routes (specific paths first)
    .get(
      '/active',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.templateController.getActive, runtime.templateController, [c, c.req.valid('query')]);
      }
    )
    .get(
      '/',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.templateController.getAll, runtime.templateController, [c, c.req.valid('query')]);
      }
    )
    // Admin-only write routes
    .post(
      '/',
      adminOnly,
      zValidator('form', emptyFormSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.templateController.create, runtime.templateController, [c, c.req.valid('form')]);
      }
    )
    .put(
      '/:id',
      adminOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('form', emptyFormSchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.templateController.update, runtime.templateController, [c, c.req.valid('param'), c.req.valid('form')]);
      }
    )
    .delete(
      '/:id',
      adminOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.templateController.delete, runtime.templateController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    .patch(
      '/:id/toggle-active',
      adminOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.templateController.toggleActive, runtime.templateController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    // Public read routes (by ID and download)
    .get(
      '/:id/download',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.templateController.download, runtime.templateController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    )
    .get(
      '/:id',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        const runtime = createRuntime(c.env);
        return Reflect.apply(runtime.templateController.getById, runtime.templateController, [c, c.req.valid('param'), c.req.valid('query')]);
      }
    );

  return router;
};
