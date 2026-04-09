import { Context } from 'hono';
import { LogbookService } from '@/services/logbook.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';

export class LogbookController {
  constructor(private logbookService: LogbookService) {}

  private getUserId(c: Context): string | null {
    const user = c.get('user') as JWTPayload;
    return user?.userId ?? null;
  }

  /**
   * POST /api/mahasiswa/logbook
   */
  createLogbook = async (c: Context) => {
    try {
      const userId = this.getUserId(c);
      if (!userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const { date, activity, description, hours } = await c.req.json();

      if (!date || !activity || !description) {
        return c.json(createResponse(false, 'date, activity, and description are required'), 400);
      }

      const entry = await this.logbookService.createLogbook(userId, {
        date,
        activity,
        description,
        hours: hours !== undefined ? Number(hours) : undefined,
      });

      return c.json(createResponse(true, 'Logbook entry created successfully', entry), 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes('active internship')) {
        return c.json(createResponse(false, error.message), 422);
      }
      return handleError(c, error);
    }
  };

  /**
   * GET /api/mahasiswa/logbook
   */
  getLogbooks = async (c: Context) => {
    try {
      const userId = this.getUserId(c);
      if (!userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const data = await this.logbookService.getLogbooks(userId);
      return c.json(createResponse(true, 'Logbook entries retrieved successfully', data), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('active internship')) {
        return c.json(createResponse(false, error.message), 422);
      }
      return handleError(c, error);
    }
  };

  /**
   * GET /api/mahasiswa/logbook/stats
   */
  getLogbookStats = async (c: Context) => {
    try {
      const userId = this.getUserId(c);
      if (!userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const stats = await this.logbookService.getLogbookStats(userId);
      return c.json(createResponse(true, 'Logbook stats retrieved successfully', stats), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('active internship')) {
        return c.json(createResponse(false, error.message), 422);
      }
      return handleError(c, error);
    }
  };

  /**
   * GET /api/mahasiswa/logbook/:id
   */
  getLogbookById = async (c: Context) => {
    try {
      const userId = this.getUserId(c);
      if (!userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const id = c.req.param('id');
      const entry = await this.logbookService.getLogbookById(userId, id);
      return c.json(createResponse(true, 'Logbook entry retrieved successfully', entry), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json(createResponse(false, error.message), 404);
      }
      return handleError(c, error);
    }
  };

  /**
   * PUT /api/mahasiswa/logbook/:id
   */
  updateLogbook = async (c: Context) => {
    try {
      const userId = this.getUserId(c);
      if (!userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const id = c.req.param('id');
      const { date, activity, description, hours } = await c.req.json();

      const updated = await this.logbookService.updateLogbook(userId, id, {
        date,
        activity,
        description,
        hours: hours !== undefined ? Number(hours) : undefined,
      });

      return c.json(createResponse(true, 'Logbook entry updated successfully', updated), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json(createResponse(false, error.message), 404);
      }
      if (error instanceof Error && (error.message.includes('Cannot edit') || error.message.includes('Cannot delete'))) {
        return c.json(createResponse(false, error.message), 422);
      }
      return handleError(c, error);
    }
  };

  /**
   * DELETE /api/mahasiswa/logbook/:id
   */
  deleteLogbook = async (c: Context) => {
    try {
      const userId = this.getUserId(c);
      if (!userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const id = c.req.param('id');
      await this.logbookService.deleteLogbook(userId, id);
      return c.json(createResponse(true, 'Logbook entry deleted successfully'), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json(createResponse(false, error.message), 404);
      }
      if (error instanceof Error && error.message.includes('Cannot delete')) {
        return c.json(createResponse(false, error.message), 422);
      }
      return handleError(c, error);
    }
  };

  /**
   * POST /api/mahasiswa/logbook/:id/submit
   */
  submitLogbook = async (c: Context) => {
    try {
      const userId = this.getUserId(c);
      if (!userId) return c.json(createResponse(false, 'Unauthorized'), 401);

      const id = c.req.param('id');
      const entry = await this.logbookService.submitLogbook(userId, id);
      return c.json(createResponse(true, 'Logbook entry submitted for review', entry), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json(createResponse(false, error.message), 404);
      }
      if (error instanceof Error && error.message.includes('status')) {
        return c.json(createResponse(false, error.message), 422);
      }
      return handleError(c, error);
    }
  };
}
