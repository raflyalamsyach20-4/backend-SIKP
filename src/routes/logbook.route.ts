import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import { validateFileUpload } from '@/middlewares/file.middleware';
import { zValidator } from '@hono/zod-validator';
import { createLogbookSchema, updateLogbookSchema } from '@/validation';
import { emptyQuerySchema } from '@/schemas/common.schema';
import { LogbookController } from '@/controllers/logbook.controller';

/**
 * Logbook Routes
 */
export const createLogbookRoutes = () => {
  const logbook = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    .post('/', mahasiswaOnly, zValidator('json', createLogbookSchema), async (c) => {
      return new LogbookController(c).createLogbook(c.req.valid('json'));
    })
    .get('/stats', mahasiswaOnly, async (c) => {
      return new LogbookController(c).getLogbookStats();
    })
    .get('/', mahasiswaOnly, async (c) => {
      return new LogbookController(c).getLogbookList();
    })
    .get('/:id', mahasiswaOnly, async (c) => {
      return new LogbookController(c).getLogbookDetail();
    })
    .put('/:logbookId', mahasiswaOnly, zValidator('json', updateLogbookSchema), async (c) => {
      return new LogbookController(c).updateLogbook(c.req.valid('json'));
    })
    .delete('/:logbookId', mahasiswaOnly, zValidator('query', emptyQuerySchema), async (c) => {
      return new LogbookController(c).deleteLogbook();
    })
    .post('/:id/photo', 
      mahasiswaOnly, 
      validateFileUpload({
        fieldName: 'file',
        maxSizeMB: 2,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
      }),
      async (c) => {
        return new LogbookController(c).uploadPhoto();
      }
    )
    .post('/:id/submit', mahasiswaOnly, async (c) => {
      return new LogbookController(c).submitLogbook();
    });

  return logbook;
};
