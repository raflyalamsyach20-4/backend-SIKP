import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly } from '@/middlewares/auth.middleware';
import type { CloudflareBindings } from '@/config';
import { createDbClient } from '@/db';
import { MahasiswaRepository } from '@/repositories/mahasiswa.repository';
import { MahasiswaService } from '@/services/mahasiswa.service';
import { MahasiswaController } from '@/controllers/mahasiswa.controller';
import { UserRepository } from '@/repositories/user.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { StorageService } from '@/services/storage.service';
import { ResponseLetterRepository } from '@/repositories/response-letter.repository';

import { zValidator } from '@hono/zod-validator';
import { createRuntime } from '@/runtime';
import { emptyQuerySchema } from '@/schemas/common.schema';

export const createInternshipRoutes = () => {
  return new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware, mahasiswaOnly)
    .get('/', zValidator('query', emptyQuerySchema), async (c) => {
      const runtime = createRuntime(c.env);
      return Reflect.apply(runtime.mahasiswaController.getInternship, runtime.mahasiswaController, [c, c.req.valid('query')]);
    });
};
