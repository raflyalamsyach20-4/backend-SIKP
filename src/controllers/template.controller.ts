import { Context } from 'hono';
import { TemplateService } from '@/services/template.service';
import type { JWTPayload, TemplateField } from '@/types';
import { createResponse, handleError } from '@/utils/helpers';

type TemplateType = 'Template Only' | 'Generate & Template';

const isTemplateType = (value: string): value is TemplateType => {
  return value === 'Template Only' || value === 'Generate & Template';
};

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
      const userRole = (this.c.get('user') as JWTPayload | undefined)?.role || 'MAHASISWA';
      
      const type = this.c.req.query('type');
      const isActive = this.c.req.query('isActive');
      const search = this.c.req.query('search');

      const filters: { type?: string; isActive?: boolean; search?: string } = {};
      if (type) filters.type = type;
      if (isActive !== undefined) filters.isActive = isActive === 'true';
      if (search) filters.search = search;

      const templates = await this.templateService.getAllTemplates(filters, userRole);

      return this.c.json(createResponse(true, 'Templates berhasil diambil', templates), 200);
    } catch (error) {
      return handleError(this.c, error, 'Gagal mengambil templates');
    }
  }

  /**
   * GET /api/templates/active
   * Get only active templates
   */
  async getActive() {
    try {
      const templates = await this.templateService.getActiveTemplates();
      return this.c.json(createResponse(true, 'Templates aktif berhasil diambil', templates), 200);
    } catch (error) {
      return handleError(this.c, error, 'Gagal mengambil templates aktif');
    }
  }

  /**
   * GET /api/templates/:id
   * Get template by ID
   */
  async getById() {
    try {
      const id = this.c.req.param('id');
      const userRole = (this.c.get('user') as JWTPayload | undefined)?.role || 'MAHASISWA';

      const template = await this.templateService.getTemplateById(id, userRole);
      
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
      const typeRaw = formData.get('type') as string;
      const description = formData.get('description') as string;
      const fieldsStr = formData.get('fields') as string;
      const isActive = formData.get('isActive') === 'true';

      // Validate required fields
      if (!file) {
        return this.c.json(createResponse(false, 'File wajib diupload'), 400);
      }

      if (!name) {
        return this.c.json(createResponse(false, 'Nama template wajib diisi'), 400);
      }

      if (!typeRaw) {
        return this.c.json(createResponse(false, 'Tipe template wajib diisi'), 400);
      }

      if (!isTemplateType(typeRaw)) {
        return this.c.json(createResponse(false, 'Tipe template tidak valid'), 400);
      }

      // Parse fields if provided
      let fields: TemplateField[] | undefined;
      if (fieldsStr) {
        try {
          fields = JSON.parse(fieldsStr);
          if (!Array.isArray(fields)) {
            return this.c.json(createResponse(false, 'Fields harus berupa array JSON'), 400);
          }
        } catch (e) {
          return this.c.json(createResponse(false, 'Fields bukan JSON yang valid'), 400);
        }
      }

      // Create template
      const result = await this.templateService.createTemplate(
        file,
        { name, type: typeRaw, description, fields, isActive },
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
      const typeRaw = formData.get('type') as string;
      const description = formData.get('description') as string;
      const fieldsStr = formData.get('fields') as string;
      const isActive = formData.get('isActive') as string;

      const updates: {
        file?: File;
        name?: string;
        type?: TemplateType;
        description?: string;
        fields?: TemplateField[];
        isActive?: boolean;
      } = {};

      if (file) updates.file = file;
      if (name) updates.name = name;
      if (typeRaw) {
        if (!isTemplateType(typeRaw)) {
          return this.c.json(createResponse(false, 'Tipe template tidak valid'), 400);
        }
        updates.type = typeRaw;
      }
      if (description !== undefined) updates.description = description;
      if (isActive !== undefined) updates.isActive = isActive === 'true';

      // Parse fields if provided
      if (fieldsStr) {
        try {
          const fields = JSON.parse(fieldsStr);
          if (!Array.isArray(fields)) {
            return this.c.json(createResponse(false, 'Fields harus berupa array JSON'), 400);
          }
          updates.fields = fields;
        } catch (e) {
          return this.c.json(createResponse(false, 'Fields bukan JSON yang valid'), 400);
        }
      }

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
   * PATCH /api/templates/:id/toggle-active
   * Toggle template active status (Admin only)
   */
  async toggleActive() {
    try {
      const user = this.c.get('user') as JWTPayload;
      
      // Check authorization
      if (user.role !== 'admin') {
        return this.c.json(createResponse(false, 'Anda tidak memiliki akses untuk endpoint ini'), 403);
      }

      const id = this.c.req.param('id');

      const result = await this.templateService.toggleActive(id);

      if (result.error) {
        if (result.error === 'Template tidak ditemukan') {
          return this.c.json(createResponse(false, result.error), 404);
        }
        return this.c.json(createResponse(false, result.error), 400);
      }

      return this.c.json(
        createResponse(true, 'Status template berhasil diubah', result.template),
        200
      );
    } catch (error) {
      return handleError(this.c, error, 'Gagal mengubah status template');
    }
  }

  /**
   * GET /api/templates/:id/download
   * Download template file
   */
  async download() {
    try {
      const id = this.c.req.param('id');
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
      const contentDisposition = `attachment; filename="${template.originalName}"`;

      this.c.header('Content-Type', contentType);
      this.c.header('Content-Disposition', contentDisposition);
      if (buffer) {
        this.c.header('Content-Length', buffer.length.toString());
      }

      if (buffer) {
        return new Response(buffer, {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': contentDisposition,
          },
        });
      }

      return this.c.json(createResponse(false, 'File tidak tersedia'), 400);
    } catch (error) {
      return handleError(this.c, error, 'Gagal mengunduh file template');
    }
  }
}
