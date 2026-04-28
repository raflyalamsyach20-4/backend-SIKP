import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { emptyQuerySchema } from '@/schemas/common.schema';
import { InternshipController } from '@/controllers/internship.controller';

/**
 * Internship Routes
 */
export const createInternshipRoutes = () => {
  const internship = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    .get(
      '/',
      mahasiswaOnly,
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new InternshipController(c).getInternship();
      }
    );

  return internship;
};
