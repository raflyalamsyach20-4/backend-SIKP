import { Context } from 'hono';
import { createResponse, handleError } from '@/utils/helpers';
import { MonitoringService } from '@/services/monitoring.service';
import type { JWTPayload } from '@/types';

export class MonitoringController {
  private monitoringService: MonitoringService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.monitoringService = new MonitoringService(this.c.env);
  }

  private getUser(): JWTPayload {
    const user = this.c.get('user') as JWTPayload;
    if (!user || !user.profileId) {
      throw new Error('Unauthorized: Missing profileId');
    }
    return user;
  }

  /**
   * GET /api/internship-monitoring/mentees
   * List all mentees for the logged-in lecturer
   */
  getMenteesProgress = async () => {
    try {
      const user = this.getUser();
      const sessionId = user.sessionId!;
      const lecturerId = user.profileId!; // Guaranteed by getUser() check

      const data = await this.monitoringService.getMenteesProgress(lecturerId, sessionId);
      return this.c.json(createResponse(true, 'Mentees progress retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/internship-monitoring/mentees/:studentId/logbooks
   * Detail logbook for a specific mentee
   */
  getStudentLogbooks = async () => {
    try {
      const user = this.getUser();
      const lecturerId = user.profileId!;
      const studentId = this.c.req.param('studentId');

      const data = await this.monitoringService.getStudentLogbooks(lecturerId, studentId);
      return this.c.json(createResponse(true, 'Student logbooks retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/internship-monitoring/inactive
   * List students who have been inactive in logbook entries
   */
  getInactiveStudents = async () => {
    try {
      const user = this.getUser();
      const lecturerId = user.profileId!;
      const threshold = parseInt(this.c.req.query('threshold') || '3');

      const data = await this.monitoringService.getInactiveStudents(lecturerId, threshold);
      return this.c.json(createResponse(true, 'Inactive students identified', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };
}
