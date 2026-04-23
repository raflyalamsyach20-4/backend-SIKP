import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, adminOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { withContainer } from './route-handler';
import { emptyFormSchema, emptyQuerySchema, nonEmptyStringParamsSchema } from '@/schemas/common.schema';

/**
 * Extended context variables
 */
type Variables = {
  container: DIContainer;
};

/**
 * Template Routes
 * Handles template management endpoints
 */
export const createTemplateRoutes = () => {
  const router = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>()
    // Apply auth middleware to all template routes
    .use('*', authMiddleware)
    // Public read routes (specific paths first)
    .get(
      '/active',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.templateController.getActive(c))
    )
    .get(
      '/',
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.templateController.getAll(c))
    )
    // Admin-only write routes
    .post(
      '/',
      adminOnly,
      zValidator('form', emptyFormSchema),
      withContainer((container, c) => container.templateController.create(c))
    )
    .put(
      '/:id',
      adminOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('form', emptyFormSchema),
      withContainer((container, c) => container.templateController.update(c))
    )
    .delete(
      '/:id',
      adminOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.templateController.delete(c))
    )
    .patch(
      '/:id/toggle-active',
      adminOnly,
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.templateController.toggleActive(c))
    )
    // Public read routes (by ID and download)
    .get(
      '/:id/download',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.templateController.download(c))
    )
    .get(
      '/:id',
      zValidator('param', nonEmptyStringParamsSchema),
      zValidator('query', emptyQuerySchema),
      withContainer((container, c) => container.templateController.getById(c))
    );

  return router;
};
