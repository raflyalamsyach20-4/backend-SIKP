import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly, dosenOnly } from '@/middlewares/auth.middleware';
import { validateFileUpload } from '@/middlewares/file.middleware';
import { ReportingController } from '@/controllers/reporting.controller';

export const createReportingRoutes = () => {
  const route = new Hono<{ Bindings: CloudflareBindings }>();
  route.use('*', authMiddleware);

  /**
   * Fast Track Reporting (Alur Pintas)
   */
  route.post('/submit-fast', 
    mahasiswaOnly, 
    validateFileUpload({
      fieldName: 'file',
      maxSizeMB: 10,
      allowedMimeTypes: ['application/pdf']
    }),
    async (c) => {
      return new ReportingController(c).submitFast();
    }
  );

  route.post('/score-fast', 
    dosenOnly, 
    async (c) => {
      return new ReportingController(c).scoreFast();
    }
  );

  return route;
};
