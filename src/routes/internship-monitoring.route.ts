import { Hono } from 'hono';
import { authMiddleware, staffOnly } from '@/middlewares/auth.middleware';
import { zValidator } from '@hono/zod-validator';
import { emptyQuerySchema } from '@/schemas/common.schema';
import { MentorWorkflowController } from '@/controllers/mentor-workflow.controller';

/**
 * Internship Monitoring Routes
 */
export const createInternshipMonitoringRoutes = () => {
  const monitoring = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    .get(
      '/logbook',
      staffOnly,
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new MentorWorkflowController(c).getDosenLogbookMonitor();
      }
    )
    .get(
      '/logbook/:studentId',
      staffOnly,
      zValidator('query', emptyQuerySchema),
      async (c) => {
        return new MentorWorkflowController(c).getDosenLogbookMonitorByStudent();
      }
    );

  return monitoring;
};
