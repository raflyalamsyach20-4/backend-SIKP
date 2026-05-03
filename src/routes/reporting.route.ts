import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly, dosenOnly } from '@/middlewares/auth.middleware';
import { ReportingController } from '@/controllers/reporting.controller';

export const createReportingRoutes = () => {
  const route = new Hono<{ Bindings: CloudflareBindings }>();

  route.use('*', authMiddleware);

  // Fast Track Routes
  route.post('/submit-fast', 
    mahasiswaOnly,
    async (c) => new ReportingController(c).submitFast()
  );

  route.post('/score-fast', 
    dosenOnly,
    async (c) => new ReportingController(c).scoreFast()
  );

  // Standard Flow - Title
  route.post('/title',
    mahasiswaOnly,
    async (c) => new ReportingController(c).submitTitle()
  );

  route.get('/title/:internshipId',
    async (c) => new ReportingController(c).getTitle()
  );

  route.post('/title/:id/approve',
    dosenOnly,
    async (c) => new ReportingController(c).approveTitle()
  );

  route.post('/title/:id/reject',
    dosenOnly,
    async (c) => new ReportingController(c).rejectTitle()
  );

  // Standard Flow - Report
  route.post('/report',
    mahasiswaOnly,
    async (c) => new ReportingController(c).submitReport()
  );

  route.get('/report/:internshipId',
    async (c) => new ReportingController(c).getReport()
  );

  return route;
};
