import { Hono } from 'hono';
import { authMiddleware, mahasiswaOnly, adminOnly } from '@/middlewares/auth.middleware';
import { ArchiveController } from '@/controllers/archive.controller';

/**
 * Archive Routes
 */
export const createArchiveRoutes = () => {
  const archive = new Hono<{ Bindings: CloudflareBindings }>()
    .use('*', authMiddleware)
    // Student Archive
    .get(
      '/student',
      mahasiswaOnly,
      async (c) => {
        return new ArchiveController(c).getStudentArchive();
      }
    )
    // Admin Archive
    .get(
      '/admin/internships',
      adminOnly,
      async (c) => {
        return new ArchiveController(c).getAllInternshipArchive();
      }
    )
    .get(
      '/admin/submissions',
      adminOnly,
      async (c) => {
        return new ArchiveController(c).getAllSubmissionArchive();
      }
    )
    // Action: Archive an internship
    .post(
      '/internship/:id',
      adminOnly,
      async (c) => {
        return new ArchiveController(c).archiveInternship();
      }
    );

  return archive;
};
