import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { createDbClient } from '@/db';
import { LogbookRepository } from '@/repositories/logbook.repository';
import { LogbookService } from '@/services/logbook.service';
import { LogbookController } from '@/controllers/logbook.controller';

import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { createLogbookSchema, updateLogbookSchema } from '@/validation';
import { emptyQuerySchema } from '@/schemas/common.schema';

export const createLogbookRoutes = () => {
  return new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    .post('/', mahasiswaOnly, zValidator('json', createLogbookSchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.logbookController.createLogbook, runtime.logbookController, [c, c.req.valid('json')]);
    })
    .get('/stats', mahasiswaOnly, zValidator('query', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.logbookController.getLogbookStats, runtime.logbookController, [c, c.req.valid('query')]);
    })
    .get('/', mahasiswaOnly, zValidator('query', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.logbookController.getLogbooks, runtime.logbookController, [c, c.req.valid('query')]);
    })
    .get('/:id', mahasiswaOnly, zValidator('query', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.logbookController.getLogbookById, runtime.logbookController, [c, c.req.valid('query')]);
    })
    .put('/:logbookId', mahasiswaOnly, zValidator('json', updateLogbookSchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.logbookController.updateLogbook, runtime.logbookController, [c, c.req.valid('json')]);
    })
    .delete('/:logbookId', mahasiswaOnly, zValidator('query', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.logbookController.deleteLogbook, runtime.logbookController, [c, c.req.valid('query')]);
    });
};
