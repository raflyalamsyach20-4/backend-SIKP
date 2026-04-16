import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware, adminOnly } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';

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
  const router = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  // Apply auth middleware to all template routes
  router.use('*', authMiddleware);

  // Public read routes (specific paths first)
  router.get('/active', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.templateController.getActive(c);
  });

  router.get('/', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.templateController.getAll(c);
  });

  // Admin-only write routes
  router.post('/', adminOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.templateController.create(c);
  });

  router.put('/:id', adminOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.templateController.update(c);
  });

  router.delete('/:id', adminOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.templateController.delete(c);
  });

  router.patch('/:id/toggle-active', adminOnly, async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.templateController.toggleActive(c);
  });

  // Public read routes (by ID and download)
  router.get('/:id/download', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.templateController.download(c);
  });

  router.get('/:id', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.templateController.getById(c);
  });

  return router;
};
