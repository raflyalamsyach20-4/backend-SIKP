import { Hono } from 'hono';
import { authMiddleware, staffOnly } from '@/middlewares/auth.middleware';
import { MonitoringController } from '@/controllers/monitoring.controller';

/**
 * Internship Monitoring Routes
 * Specifically for Lecturers (Dosen Pembimbing)
 */
export const createInternshipMonitoringRoutes = () => {
  const monitoring = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    .use('*', staffOnly); // Only Dosen/Staff can access

  // New Domain-Based Routes
  monitoring.get('/mentees', (c) => new MonitoringController(c).getMenteesProgress());
  monitoring.get('/mentees/:studentId/logbooks', (c) => new MonitoringController(c).getStudentLogbooks());
  monitoring.get('/inactive', (c) => new MonitoringController(c).getInactiveStudents());

  // Legacy Compatibility (Aliases)
  monitoring.get('/logbook', (c) => new MonitoringController(c).getMenteesProgress());
  monitoring.get('/logbook/:studentId', (c) => new MonitoringController(c).getStudentLogbooks());

  return monitoring;
};
