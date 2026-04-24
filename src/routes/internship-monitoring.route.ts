import { Hono } from 'hono';
import { authMiddleware, staffOnly } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { createDbClient } from '@/db';
import { MentorWorkflowRepository } from '@/repositories/mentor-workflow.repository';
import { MentorWorkflowService } from '@/services/mentor-workflow.service';
import { MentorWorkflowController } from '@/controllers/mentor-workflow.controller';

import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyQuerySchema } from '@/schemas/common.schema';

export const createInternshipMonitoringRoutes = () => {
  return new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware, staffOnly)
    .get('/logbook', zValidator('query', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorWorkflowController.getDosenLogbookMonitor, runtime.mentorWorkflowController, [c, c.req.valid('query')]);
    })
    .get('/logbook/:studentId', zValidator('query', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorWorkflowController.getDosenLogbookMonitorByStudent, runtime.mentorWorkflowController, [c, c.req.valid('query')]);
    });
};
