import { Hono } from 'hono';
import { authMiddleware, adminOnly } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { emptyFormSchema, emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';
import { TemplateController } from '@/controllers';

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
        return new TemplateController(c).getActive();
      }
    )
    .get(
      '/',
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new TemplateController(c).getAll();
      }
    )
    // Admin-only write routes
    .post(
      '/',
      adminOnly,
      zValidator('form', emptyFormSchema),
      async (c) => {
        return new TemplateController(c).create();
      }
    )
    .put(
      '/:id',
      adminOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('form', emptyFormSchema),
      async (c) => {
        return new TemplateController(c).update();
      }
    )
    .delete(
      '/:id',
      adminOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new TemplateController(c).delete();
      }
    )
    .patch(
      '/:id/toggle-active',
      adminOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new TemplateController(c).toggleActive();
      }
    )
    // Public read routes (by ID and download)
    .get(
      '/:id/download',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new TemplateController(c).download();
      }
    )
    .get(
      '/:id',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new TemplateController(c).getById();
      }
    );

  return router;
};
