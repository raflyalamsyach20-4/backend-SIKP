import { nanoid } from 'nanoid';
import { createDbClient } from '@/db';
import { TemplateRepository } from '@/repositories/template.repository';
import { StorageService } from './storage.service';
import type { Template } from '@/types';

type CreateTemplateInput = {
  name: string;
  type: string;
  description?: string;
};

type UpdateTemplateInput = {
  file?: File;
  name?: string;
  type?: string;
  description?: string;
};

export class TemplateService {
  private repository: TemplateRepository;
  private storageService: StorageService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.repository = new TemplateRepository(db);
    this.storageService = new StorageService(this.env);
  }

  async getAllTemplates(
    filters?: { type?: string; search?: string }
  ): Promise<Template[]> {
    return await this.repository.findAll(filters);
  }

  async getTemplateById(id: string): Promise<Template | null> {
    return await this.repository.findById(id);
  }

  async createTemplate(
    file: File,
    data: CreateTemplateInput,
    userId: string
  ): Promise<{ template: Template | null; error?: string }> {
    // Validasi input
    const validation = this.validateTemplateInput(data);
    if (validation.error) {
      return { template: null, error: validation.error };
    }

    // Validasi file
    const fileValidation = this.validateFile(file);
    if (fileValidation.error) {
      return { template: null, error: fileValidation.error };
    }

    try {
      const uniqueFileName = this.storageService.generateUniqueFileName(file.name);
      const uploadResult = await this.storageService.uploadFile(file, uniqueFileName, 'templates');
      const fileUrl = uploadResult.url;
      const fileName = uploadResult.key;

      // Create template record
      const template = await this.repository.create({
        id: nanoid(),
        name: data.name,
        type: data.type || 'standard',
        description: data.description || null,
        fileName: fileName,
        fileUrl: fileUrl,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        originalName: file.name,
        createdByAdminId: userId,
        updatedByAdminId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { template };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create template';
      return { template: null, error: message };
    }
  }

  async updateTemplate(
    id: string,
    updates: UpdateTemplateInput,
    userId: string
  ): Promise<{ template: Template | null; error?: string }> {
    const template = await this.repository.findById(id);
    if (!template) {
      return { template: null, error: 'Template tidak ditemukan' };
    }

    try {
      let fileUrl = template.fileUrl;
      let fileName = template.fileName;
      let fileSize = template.fileSize;
      let fileType = template.fileType;
      let originalName = template.originalName;

      // Handle file replacement
      if (updates.file) {
        const fileValidation = this.validateFile(updates.file);
        if (fileValidation.error) {
          return { template: null, error: fileValidation.error };
        }

        // Upload new file to R2
        const uniqueFileName = this.storageService.generateUniqueFileName(updates.file.name);
        const uploadResult = await this.storageService.uploadFile(updates.file, uniqueFileName, 'templates');
        fileUrl = uploadResult.url;
        fileName = uploadResult.key;

        // Delete old file from R2 if exists
        if (template.fileName) {
          try {
            await this.storageService.deleteFile(template.fileName);
          } catch (deleteError) {
            console.error('Failed to delete old template file from R2:', deleteError);
            // Continue anyway
          }
        }

        fileSize = updates.file.size;
        fileType = updates.file.type || 'application/octet-stream';
        originalName = updates.file.name;
      }

      // Prepare update data
      const updateData: any = {
        updatedByAdminId: userId,
      };

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.type !== undefined) updateData.type = updates.type;
      if (updates.description !== undefined) updateData.description = updates.description || null;

      if (updates.file) {
        updateData.fileName = fileName;
        updateData.fileUrl = fileUrl;
        updateData.fileSize = fileSize;
        updateData.fileType = fileType;
        updateData.originalName = originalName;
      }

      const updatedTemplate = await this.repository.update(id, updateData);
      return { template: updatedTemplate };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update template';
      return { template: null, error: message };
    }
  }

  async deleteTemplate(id: string): Promise<{ success: boolean; error?: string }> {
    const template = await this.repository.findById(id);
    if (!template) {
      return { success: false, error: 'Template tidak ditemukan' };
    }

    try {
      // Delete file from R2
      if (template.fileName) {
        try {
          await this.storageService.deleteFile(template.fileName);
        } catch (deleteError) {
          console.error('Failed to delete template file from R2:', deleteError);
          // Continue anyway, don't fail the delete
        }
      }

      // Delete from database
      const deleted = await this.repository.delete(id);

      return { success: deleted };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete template';
      return { success: false, error: message };
    }
  }

  async downloadTemplate(id: string, userRole?: string): Promise<{ buffer: Uint8Array | null; template: Template | null; error?: string }> {
    const template = await this.getTemplateById(id);
    if (!template) {
      return { buffer: null, template: null, error: 'Template tidak ditemukan' };
    }

    try {
      // ✅ Use StorageService instead of fetch() to be more robust
      const fileData = await this.storageService.getFile(template.fileName) as any;
      
      if (!fileData) {
        return { buffer: null, template, error: 'File template tidak ditemukan di storage' };
      }

      // Handle both R2ObjectBody (native R2) and custom object (S3 fallback)
      let arrayBuffer: ArrayBuffer;
      
      if (typeof fileData.arrayBuffer === 'function') {
        // Native R2ObjectBody
        arrayBuffer = await fileData.arrayBuffer();
      } else if (fileData.body) {
        // S3 Fallback object { body: ... }
        const body = fileData.body;
        if (typeof body.arrayBuffer === 'function') {
          arrayBuffer = await body.arrayBuffer();
        } else if (typeof body.transformToByteArray === 'function') {
          // AWS SDK v3 stream helper
          arrayBuffer = (await body.transformToByteArray()).buffer;
        } else {
          // Fallback to Response wrapper
          arrayBuffer = await new Response(body).arrayBuffer();
        }
      } else {
        throw new Error('Format data file tidak didukung');
      }

      const buffer = new Uint8Array(arrayBuffer);
      
      return { buffer, template };
    } catch (error) {
      console.error('[TemplateService] Download error:', error);
      const message = error instanceof Error ? error.message : 'Failed to download template file';
      return { buffer: null, template: null, error: message };
    }
  }

  // Helper methods
  private validateTemplateInput(data: {
    name: string;
    type?: string;
    description?: string;
  }): { error?: string } {
    // Validate name
    if (!data.name || data.name.trim().length < 3) {
      return { error: 'Nama template minimal 3 karakter' };
    }
    if (data.name.length > 255) {
      return { error: 'Nama template maksimal 255 karakter' };
    }

    return {};
  }

  private validateFile(file: File): { error?: string } {
    const allowedTypes = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'text/html',
      'text/plain',
    ];

    const allowedExtensions = ['doc', 'docx', 'pdf', 'html', 'txt'];

    // Check file size (10 MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return { error: 'File terlalu besar. Maksimal 10 MB' };
    }

    // Check file type
    if (!allowedTypes.includes(file.type)) {
      return { error: 'Tipe file tidak diizinkan. File yang diizinkan: .doc, .docx, .pdf, .html, .txt' };
    }

    // Check file extension
    const extension = this.getFileExtension(file.name);
    if (!allowedExtensions.includes(extension.toLowerCase())) {
      return { error: 'Ekstensi file tidak diizinkan. File yang diizinkan: .doc, .docx, .pdf, .html, .txt' };
    }

    return {};
  }

  private getFileExtension(fileName: string): string {
    return fileName.split('.').pop() || 'bin';
  }
}
