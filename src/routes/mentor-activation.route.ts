import { Hono } from 'hono';
import type { CloudflareBindings } from '@/config';
import { createDbClient } from '@/db';
import { MentorWorkflowRepository } from '@/repositories/mentor-workflow.repository';
import { MentorWorkflowService } from '@/services/mentor-workflow.service';
import { MentorWorkflowController } from '@/controllers/mentor-workflow.controller';

import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyJsonSchema } from '@/schemas/common.schema';

export const createMentorActivationRoutes = () => {
  return new Hono<{ Bindings: CloudflareBindings }>()
    .post('/activate', zValidator('json', emptyJsonSchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorWorkflowController.activateMentor, runtime.mentorWorkflowController, [c, c.req.valid('json')]);
    })
    .post('/set-password', zValidator('json', emptyJsonSchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mentorWorkflowController.setMentorPassword, runtime.mentorWorkflowController, [c, c.req.valid('json')]);
    });
};
