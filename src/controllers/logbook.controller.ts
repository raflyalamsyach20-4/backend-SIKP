import { Context } from 'hono';
import { LogbookService } from '@/services/logbook.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';

export class LogbookController {
  private logbookService: LogbookService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.logbookService = new LogbookService(this.c.env);
  }

  private getUserId(): string | null {
    const user = this.c.get('user') as JWTPayload;
    return user?.userId ?? null;
  }

  /**
   * POST /api/logbooks
   */
  createLogbook = async (validated: any) => {
    try {
      const userId = this.getUserId();
      if (!userId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const entry = await this.logbookService.createLogbook(userId, validated);

      return this.c.json(createResponse(true, 'Logbook entry created successfully', entry), 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes('active internship')) {
        return this.c.json(createResponse(false, error.message), 422);
      }
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/logbooks
   */
  getLogbookList = async () => {
    try {
      const userId = this.getUserId();
      if (!userId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const data = await this.logbookService.getLogbooks(userId);
      return this.c.json(createResponse(true, 'Logbook entries retrieved successfully', data), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('active internship')) {
        return this.c.json(createResponse(false, error.message), 422);
      }
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/logbooks/stats
   */
  getLogbookStats = async () => {
    try {
      const userId = this.getUserId();
      if (!userId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const stats = await this.logbookService.getLogbookStats(userId);
      return this.c.json(createResponse(true, 'Logbook stats retrieved successfully', stats), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('active internship')) {
        return this.c.json(createResponse(false, error.message), 422);
      }
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/logbooks/:id
   */
  getLogbookDetail = async () => {
    try {
      const userId = this.getUserId();
      if (!userId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const id = this.c.req.param('id');
      const entry = await this.logbookService.getLogbookById(userId, id);
      return this.c.json(createResponse(true, 'Logbook entry retrieved successfully', entry), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return this.c.json(createResponse(false, error.message), 404);
      }
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/logbooks/:id/photo
   */
  uploadPhoto = async () => {
    try {
      const userId = this.getUserId();
      if (!userId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const id = this.c.req.param('id');
      const formData = await this.c.req.formData();
      const file = formData.get('file') as File;

      if (!file || typeof file === 'string') {
        return this.c.json(createResponse(false, 'No file uploaded or invalid file'), 400);
      }

      const updated = await this.logbookService.uploadPhoto(userId, id, file);
      return this.c.json(createResponse(true, 'Photo uploaded successfully', updated), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return this.c.json(createResponse(false, error.message), 404);
      }
      return handleError(this.c, error);
    }
  };

  /**
   * PUT /api/logbooks/:logbookId
   */
  updateLogbook = async (validated: any) => {
    try {
      const userId = this.getUserId();
      if (!userId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const id = this.c.req.param('logbookId');

      const updated = await this.logbookService.updateLogbook(userId, id, validated);

      return this.c.json(createResponse(true, 'Logbook entry updated successfully', updated), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return this.c.json(createResponse(false, error.message), 404);
      }
      if (error instanceof Error && (error.message.includes('Cannot edit') || error.message.includes('Cannot delete'))) {
        return this.c.json(createResponse(false, error.message), 422);
      }
      return handleError(this.c, error);
    }
  };

  /**
   * DELETE /api/logbooks/:logbookId
   */
  deleteLogbook = async () => {
    try {
      const userId = this.getUserId();
      if (!userId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const id = this.c.req.param('logbookId');
      await this.logbookService.deleteLogbook(userId, id);
      return this.c.json(createResponse(true, 'Logbook entry deleted successfully'), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return this.c.json(createResponse(false, error.message), 404);
      }
      if (error instanceof Error && error.message.includes('Cannot delete')) {
        return this.c.json(createResponse(false, error.message), 422);
      }
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/mahasiswa/logbook/:id/submit
   */
  submitLogbook = async () => {
    try {
      const userId = this.getUserId();
      if (!userId) return this.c.json(createResponse(false, 'Unauthorized'), 401);

      const id = this.c.req.param('id');
      const entry = await this.logbookService.submitLogbook(userId, id);
      return this.c.json(createResponse(true, 'Logbook entry submitted for review', entry), 200);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return this.c.json(createResponse(false, error.message), 404);
      }
      if (error instanceof Error && error.message.includes('status')) {
        return this.c.json(createResponse(false, error.message), 422);
      }
      return handleError(this.c, error);
    }
  };
}
