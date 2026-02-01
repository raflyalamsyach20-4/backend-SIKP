import { Hono } from 'hono';
import type { DbClient } from '@/db';
import { TemplateController } from '@/controllers/template.controller';
import { authMiddleware } from '@/middlewares/auth.middleware';

export const createTemplateRoutes = (db: DbClient, uploadConfig: { R2Bucket?: R2Bucket; s3Client?: any }) => {
  const router = new Hono<{ Bindings: { R2_BUCKET?: R2Bucket } }>();
  const controller = new TemplateController(db, uploadConfig);

  // Public routes (require authentication)
  router.use('*', authMiddleware);

  // Get all templates
  router.get('/', (c) => controller.getAll(c));

  // Get active templates
  router.get('/active', (c) => controller.getActive(c));

  // Get template by ID
  router.get('/:id', (c) => controller.getById(c));

  // Create template (Admin only)
  router.post('/', (c) => controller.create(c));

  // Update template (Admin only)
  router.put('/:id', (c) => controller.update(c));

  // Delete template (Admin only)
  router.delete('/:id', (c) => controller.delete(c));

  // Toggle active status (Admin only)
  router.patch('/:id/toggle-active', (c) => controller.toggleActive(c));

  // Download template file
  router.get('/:id/download', (c) => controller.download(c));

  return router;
};
