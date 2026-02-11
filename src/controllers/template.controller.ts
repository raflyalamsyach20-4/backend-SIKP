import { Context } from 'hono';
import type { DbClient } from '@/db';
import { TemplateService } from '@/services/template.service';
import type { TemplateField } from '@/types';
import { createResponse, handleError } from '@/utils/helpers';

export class TemplateController {
  private templateService: TemplateService;

  constructor(
    private db: DbClient,
    uploadConfig: { R2Bucket?: R2Bucket; s3Client?: any },
    private r2Domain?: string,
    private r2BucketName?: string
  ) {
    this.templateService = new TemplateService(db, uploadConfig, r2Domain, r2BucketName);
  }

  /**
   * GET /api/templates
   * Get all templates with optional filters
   */
  async getAll(c: Context) {
    try {
      const userRole = (c.get('user') as any)?.role || 'MAHASISWA';
      
      const type = c.req.query('type');
      const isActive = c.req.query('isActive');
      const search = c.req.query('search');

      const filters: any = {};
      if (type) filters.type = type;
      if (isActive !== undefined) filters.isActive = isActive === 'true';
      if (search) filters.search = search;

      const templates = await this.templateService.getAllTemplates(filters, userRole);

      return c.json(createResponse(true, 'Templates berhasil diambil', templates), 200);
    } catch (error) {
      return handleError(c, error, 'Gagal mengambil templates');
    }
  }

  /**
   * GET /api/templates/active
   * Get only active templates
   */
  async getActive(c: Context) {
    try {
      const templates = await this.templateService.getActiveTemplates();
      return c.json(createResponse(true, 'Templates aktif berhasil diambil', templates), 200);
    } catch (error) {
      return handleError(c, error, 'Gagal mengambil templates aktif');
    }
  }

  /**
   * GET /api/templates/:id
   * Get template by ID
   */
  async getById(c: Context) {
    try {
      const id = c.req.param('id');
      const userRole = (c.get('user') as any)?.role || 'MAHASISWA';

      const template = await this.templateService.getTemplateById(id, userRole);
      
      if (!template) {
        return c.json(createResponse(false, 'Template tidak ditemukan'), 404);
      }

      return c.json(createResponse(true, 'Template berhasil diambil', template), 200);
    } catch (error) {
      return handleError(c, error, 'Gagal mengambil template');
    }
  }

  /**
   * POST /api/templates
   * Create new template (Admin only)
   */
  async create(c: Context) {
    try {
      const user = c.get('user') as any;
      
      // Check authorization
      if (user.role !== 'ADMIN') {
        return c.json(createResponse(false, 'Anda tidak memiliki akses untuk endpoint ini'), 403);
      }

      const formData = await c.req.formData();
      const file = formData.get('file') as unknown as File | null;
      const name = formData.get('name') as string;
      const type = formData.get('type') as string;
      const description = formData.get('description') as string;
      const fieldsStr = formData.get('fields') as string;
      const isActive = formData.get('isActive') === 'true';

      // Validate required fields
      if (!file) {
        return c.json(createResponse(false, 'File wajib diupload'), 400);
      }

      if (!name) {
        return c.json(createResponse(false, 'Nama template wajib diisi'), 400);
      }

      if (!type) {
        return c.json(createResponse(false, 'Tipe template wajib diisi'), 400);
      }

      // Parse fields if provided
      let fields: TemplateField[] | undefined;
      if (fieldsStr) {
        try {
          fields = JSON.parse(fieldsStr);
          if (!Array.isArray(fields)) {
            return c.json(createResponse(false, 'Fields harus berupa array JSON'), 400);
          }
        } catch (e) {
          return c.json(createResponse(false, 'Fields bukan JSON yang valid'), 400);
        }
      }

      // Create template
      const result = await this.templateService.createTemplate(
        file,
        { name, type: type as any, description, fields, isActive },
        user.userId
      );

      if (result.error) {
        return c.json(createResponse(false, result.error), 400);
      }

      return c.json(createResponse(true, 'Template berhasil dibuat', result.template), 201);
    } catch (error) {
      return handleError(c, error, 'Gagal membuat template');
    }
  }

  /**
   * PUT /api/templates/:id
   * Update template (Admin only)
   */
  async update(c: Context) {
    try {
      const user = c.get('user') as any;
      
      // Check authorization
      if (user.role !== 'ADMIN') {
        return c.json(createResponse(false, 'Anda tidak memiliki akses untuk endpoint ini'), 403);
      }

      const id = c.req.param('id');
      const formData = await c.req.formData();

      const file = formData.get('file') as unknown as File | null;
      const name = formData.get('name') as string;
      const type = formData.get('type') as string;
      const description = formData.get('description') as string;
      const fieldsStr = formData.get('fields') as string;
      const isActive = formData.get('isActive') as string;

      const updates: any = {};

      if (file) updates.file = file;
      if (name) updates.name = name;
      if (type) updates.type = type;
      if (description !== undefined) updates.description = description;
      if (isActive !== undefined) updates.isActive = isActive === 'true';

      // Parse fields if provided
      if (fieldsStr) {
        try {
          const fields = JSON.parse(fieldsStr);
          if (!Array.isArray(fields)) {
            return c.json(createResponse(false, 'Fields harus berupa array JSON'), 400);
          }
          updates.fields = fields;
        } catch (e) {
          return c.json(createResponse(false, 'Fields bukan JSON yang valid'), 400);
        }
      }

      // Update template
      const result = await this.templateService.updateTemplate(id, updates, user.userId);

      if (result.error) {
        if (result.error === 'Template tidak ditemukan') {
          return c.json(createResponse(false, result.error), 404);
        }
        return c.json(createResponse(false, result.error || 'Gagal mengupdate template'), 400);
      }

      return c.json(createResponse(true, 'Template berhasil diupdate', result.template), 200);
    } catch (error) {
      return handleError(c, error, 'Gagal mengupdate template');
    }
  }

  /**
   * DELETE /api/templates/:id
   * Delete template (Admin only)
   */
  async delete(c: Context) {
    try {
      const user = c.get('user') as any;
      
      // Check authorization
      if (user.role !== 'ADMIN') {
        return c.json(createResponse(false, 'Anda tidak memiliki akses untuk endpoint ini'), 403);
      }

      const id = c.req.param('id');

      const result = await this.templateService.deleteTemplate(id);

      if (!result.success) {
        if (result.error === 'Template tidak ditemukan') {
          return c.json(createResponse(false, result.error), 404);
        }
        return c.json(createResponse(false, result.error || 'Gagal menghapus template'), 400);
      }

      return c.json(createResponse(true, 'Template berhasil dihapus'), 200);
    } catch (error) {
      return handleError(c, error, 'Gagal menghapus template');
    }
  }

  /**
   * PATCH /api/templates/:id/toggle-active
   * Toggle template active status (Admin only)
   */
  async toggleActive(c: Context) {
    try {
      const user = c.get('user') as any;
      
      // Check authorization
      if (user.role !== 'ADMIN') {
        return c.json(createResponse(false, 'Anda tidak memiliki akses untuk endpoint ini'), 403);
      }

      const id = c.req.param('id');

      const result = await this.templateService.toggleActive(id);

      if (result.error) {
        if (result.error === 'Template tidak ditemukan') {
          return c.json(createResponse(false, result.error), 404);
        }
        return c.json(createResponse(false, result.error), 400);
      }

      return c.json(
        createResponse(true, 'Status template berhasil diubah', result.template),
        200
      );
    } catch (error) {
      return handleError(c, error, 'Gagal mengubah status template');
    }
  }

  /**
   * GET /api/templates/:id/download
   * Download template file
   */
  async download(c: Context) {
    try {
      const id = c.req.param('id');
      const userRole = (c.get('user') as any)?.role || 'MAHASISWA';

      const result = await this.templateService.downloadTemplate(id, userRole);

      if (result.error) {
        if (result.error.includes('tidak ditemukan')) {
          return c.json(createResponse(false, result.error), 404);
        }
        return c.json(createResponse(false, result.error), 400);
      }

      const { buffer, template } = result;
      const contentType = template!.fileType || 'application/octet-stream';
      const contentDisposition = `attachment; filename="${template!.originalName}"`;

      c.header('Content-Type', contentType);
      c.header('Content-Disposition', contentDisposition);
      if (buffer) {
        c.header('Content-Length', buffer.length.toString());
      }

      // Convert buffer to ArrayBuffer for response body
      if (buffer) {
        return new Response(buffer, {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': contentDisposition,
          },
        });
      }

      return c.json(createResponse(false, 'File tidak tersedia'), 400);
    } catch (error) {
      return handleError(c, error, 'Gagal mengunduh file template');
    }
  }
}
