import { Context } from 'hono';
import { TemplateService } from '@/services/template.service';
import type { JWTPayload } from '@/types';
import { createResponse, handleError } from '@/utils/helpers';
export class TemplateController {
  private templateService: TemplateService;

  constructor(
    private c: Context<{ Bindings: CloudflareBindings }>
  ) {
    this.templateService = new TemplateService(this.c.env);
  }

  /**
   * GET /api/templates
   * Get all templates with optional filters
   */
  async getAll() {
    try {
      const type = this.c.req.query('type');
      const search = this.c.req.query('search');

      const filters: { type?: string; search?: string } = {};
      if (type) filters.type = type;
      if (search) filters.search = search;

      const templates = await this.templateService.getAllTemplates(filters);

      return this.c.json(createResponse(true, 'Templates berhasil diambil', templates), 200);
    } catch (error) {
      return handleError(this.c, error, 'Gagal mengambil templates');
    }
  }

  /**
   * GET /api/templates/:id
   * Get template by ID
   */
  async getById() {
    try {
      const id = this.c.req.param('id');
      const template = await this.templateService.getTemplateById(id);
      
      if (!template) {
        return this.c.json(createResponse(false, 'Template tidak ditemukan'), 404);
      }

      return this.c.json(createResponse(true, 'Template berhasil diambil', template), 200);
    } catch (error) {
      return handleError(this.c, error, 'Gagal mengambil template');
    }
  }

  /**
   * POST /api/templates
   * Create new template (Admin only)
   */
  async create() {
    try {
      const user = this.c.get('user') as JWTPayload;
      
      // Check authorization
      if (user.role !== 'admin') {
        return this.c.json(createResponse(false, 'Anda tidak memiliki akses untuk endpoint ini'), 403);
      }

      const formData = await this.c.req.formData();
      const fileEntry = formData.get('file');
      const file = (fileEntry as any) instanceof File ? (fileEntry as unknown as File) : null;
      const name = formData.get('name') as string;
      const type = (formData.get('type') as string) || 'standard';
      const description = formData.get('description') as string;

      // Validate required fields
      if (!file) {
        return this.c.json(createResponse(false, 'File wajib diupload'), 400);
      }

      if (!name) {
        return this.c.json(createResponse(false, 'Nama template wajib diisi'), 400);
      }

      // Create template
      const result = await this.templateService.createTemplate(
        file,
        { name, type, description },
        user.adminId || user.userId // Use adminId if available, fallback to userId
      );

      if (result.error) {
        return this.c.json(createResponse(false, result.error), 400);
      }

      return this.c.json(createResponse(true, 'Template berhasil dibuat', result.template), 201);
    } catch (error) {
      return handleError(this.c, error, 'Gagal membuat template');
    }
  }

  /**
   * PUT /api/templates/:id
   * Update template (Admin only)
   */
  async update() {
    try {
      const user = this.c.get('user') as JWTPayload;
      
      // Check authorization
      if (user.role !== 'admin') {
        return this.c.json(createResponse(false, 'Anda tidak memiliki akses untuk endpoint ini'), 403);
      }

      const id = this.c.req.param('id');
      const formData = await this.c.req.formData();

      const fileEntry = formData.get('file');
      const file = (fileEntry as any) instanceof File ? (fileEntry as unknown as File) : null;
      const name = formData.get('name') as string;
      const type = formData.get('type') as string;
      const description = formData.get('description') as string;

      const updates: {
        file?: File;
        name?: string;
        type?: string;
        description?: string;
      } = {};

      if (file) updates.file = file;
      if (name) updates.name = name;
      if (type) updates.type = type;
      if (description !== undefined) updates.description = description;

      // Update template
      const result = await this.templateService.updateTemplate(id, updates, user.adminId || user.userId);

      if (result.error) {
        if (result.error === 'Template tidak ditemukan') {
          return this.c.json(createResponse(false, result.error), 404);
        }
        return this.c.json(createResponse(false, result.error || 'Gagal mengupdate template'), 400);
      }

      return this.c.json(createResponse(true, 'Template berhasil diupdate', result.template), 200);
    } catch (error) {
      return handleError(this.c, error, 'Gagal mengupdate template');
    }
  }

  /**
   * DELETE /api/templates/:id
   * Delete template (Admin only)
   */
  async delete() {
    try {
      const user = this.c.get('user') as JWTPayload;
      
      // Check authorization
      if (user.role !== 'admin') {
        return this.c.json(createResponse(false, 'Anda tidak memiliki akses untuk endpoint ini'), 403);
      }

      const id = this.c.req.param('id');

      const result = await this.templateService.deleteTemplate(id);

      if (!result.success) {
        if (result.error === 'Template tidak ditemukan') {
          return this.c.json(createResponse(false, result.error), 404);
        }
        return this.c.json(createResponse(false, result.error || 'Gagal menghapus template'), 400);
      }

      return this.c.json(createResponse(true, 'Template berhasil dihapus'), 200);
    } catch (error) {
      return handleError(this.c, error, 'Gagal menghapus template');
    }
  }

  /**
   * GET /api/templates/:id/download
   * Download template file
   */
  async download() {
    try {
      const id = this.c.req.param('id');
      const isPreview = this.c.req.query('preview') === 'true';
      const userRole = (this.c.get('user') as JWTPayload | undefined)?.role || 'MAHASISWA';

      const result = await this.templateService.downloadTemplate(id, userRole);

      if (result.error) {
        if (result.error.includes('tidak ditemukan')) {
          return this.c.json(createResponse(false, result.error), 404);
        }
        return this.c.json(createResponse(false, result.error), 400);
      }

      const { buffer, template } = result;
      if (!template) {
        return this.c.json(createResponse(false, 'Template tidak ditemukan'), 404);
      }

      const contentType = template.fileType || 'application/octet-stream';
      const contentDisposition = isPreview ? 'inline' : `attachment; filename="${template.originalName}"`;

      if (buffer) {
        return this.c.body(buffer as any, 200, {
          'Content-Type': contentType,
          'Content-Disposition': contentDisposition,
          'Content-Length': buffer.length.toString(),
        });
      }

      return this.c.json(createResponse(false, 'File tidak tersedia'), 400);
    } catch (error) {
      return handleError(this.c, error, 'Gagal mengunduh file template');
    }
  }
}
