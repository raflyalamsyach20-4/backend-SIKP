import { nanoid } from 'nanoid';
import type { DbClient } from '@/db';
import { TemplateRepository } from '@/repositories/template.repository';
import { StorageService } from './storage.service';
import type { Template, TemplateField } from '@/types';

interface UploadConfig {
  R2Bucket?: R2Bucket;
  s3Client?: any;
}

export class TemplateService {
  private repository: TemplateRepository;
  private storageService?: StorageService;

  constructor(
    private db: DbClient,
    private uploadConfig: UploadConfig,
    r2Domain?: string,
    r2BucketName?: string
  ) {
    this.repository = new TemplateRepository(db);
    
    // Initialize StorageService if R2Bucket is available
    if (uploadConfig.R2Bucket) {
      try {
        this.storageService = new StorageService(
          uploadConfig.R2Bucket,
          r2Domain,
          r2BucketName
        );
      } catch (error) {
        console.warn('StorageService initialization failed:', error);
      }
    }
  }

  async getAllTemplates(
    filters?: { type?: string; isActive?: boolean; search?: string },
    userRole?: string
  ): Promise<Template[]> {
    // Mahasiswa hanya bisa lihat template yang aktif
    if (userRole === 'MAHASISWA' && filters?.isActive === undefined) {
      filters = { ...filters, isActive: true };
    }

    return await this.repository.findAll(filters);
  }

  async getActiveTemplates(): Promise<Template[]> {
    return await this.repository.findActive();
  }

  async getTemplateById(id: string, userRole?: string): Promise<Template | null> {
    const template = await this.repository.findById(id);

    if (!template) return null;

    // Mahasiswa hanya bisa akses template yang aktif
    if (userRole === 'MAHASISWA' && !template.isActive) {
      return null;
    }

    return template;
  }

  async createTemplate(
    file: File,
    data: {
      name: string;
      type: 'Template Only' | 'Generate & Template';
      description?: string;
      fields?: TemplateField[];
      isActive?: boolean;
    },
    userId: string
  ): Promise<{ template: Template; error?: string }> {
    // Validasi input
    const validation = this.validateTemplateInput(data);
    if (validation.error) {
      return { template: null as any, error: validation.error };
    }

    // Validasi file
    const fileValidation = this.validateFile(file);
    if (fileValidation.error) {
      return { template: null as any, error: fileValidation.error };
    }

    try {
      let fileUrl = '';
      let fileName = '';

      // Upload file to R2 if StorageService is available
      if (this.storageService) {
        const uniqueFileName = this.storageService.generateUniqueFileName(file.name);
        const uploadResult = await this.storageService.uploadFile(file, uniqueFileName, 'templates');
        fileUrl = uploadResult.url;
        fileName = uploadResult.key;
      } else {
        // Fallback: generate unique filename locally
        const fileExtension = this.getFileExtension(file.name);
        fileName = `template-${nanoid()}.${fileExtension}`;
        fileUrl = '';
      }

      // Create template record
      const template = await this.repository.create({
        id: nanoid(),
        name: data.name,
        type: data.type,
        description: data.description || null,
        fileName: fileName,
        fileUrl: fileUrl,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        originalName: file.name,
        fields: data.type === 'Generate & Template' ? data.fields || null : null,
        version: 1,
        isActive: data.isActive ?? true,
        createdBy: userId,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { template };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create template';
      return { template: null as any, error: message };
    }
  }

  async updateTemplate(
    id: string,
    updates: {
      file?: File;
      name?: string;
      type?: 'Template Only' | 'Generate & Template';
      description?: string;
      fields?: TemplateField[];
      isActive?: boolean;
    },
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
        if (this.storageService) {
          const uniqueFileName = this.storageService.generateUniqueFileName(updates.file.name);
          const uploadResult = await this.storageService.uploadFile(updates.file, uniqueFileName, 'templates');
          fileUrl = uploadResult.url;
          fileName = uploadResult.key;
        } else {
          // Fallback
          const fileExtension = this.getFileExtension(updates.file.name);
          fileName = `template-${nanoid()}.${fileExtension}`;
          fileUrl = '';
        }

        // Delete old file from R2 if exists
        if (template.fileName && this.storageService) {
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

      // Validate input if name/type changed
      if (updates.name || updates.type) {
        const validation = this.validateTemplateInput({
          name: updates.name || template.name,
          type: (updates.type || template.type) as any,
          description: updates.description !== undefined ? updates.description : template.description || undefined,
          fields: updates.fields ?? (template.fields as TemplateField[]),
        });
        if (validation.error) {
          return { template: null, error: validation.error };
        }
      }

      // Prepare update data
      const updateData: any = {
        updatedBy: userId,
      };

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.type !== undefined) updateData.type = updates.type;
      if (updates.description !== undefined) updateData.description = updates.description || null;
      if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

      if (updates.file) {
        updateData.fileName = fileName;
        updateData.fileUrl = fileUrl;
        updateData.fileSize = fileSize;
        updateData.fileType = fileType;
        updateData.originalName = originalName;
      }

      // Handle fields - if type changes to Template Only, clear fields
      if (updates.type === 'Template Only') {
        updateData.fields = null;
      } else if (updates.type === 'Generate & Template' && updates.fields !== undefined) {
        updateData.fields = updates.fields;
      } else if (updates.fields !== undefined && template.type === 'Generate & Template') {
        updateData.fields = updates.fields;
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
      // Delete file from R2 if StorageService is available
      if (template.fileName && this.storageService) {
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

  async toggleActive(id: string): Promise<{ template: Template | null; error?: string }> {
    try {
      const template = await this.repository.toggleActive(id);
      if (!template) {
        return { template: null, error: 'Template tidak ditemukan' };
      }
      return { template };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to toggle template status';
      return { template: null, error: message };
    }
  }

  async downloadTemplate(id: string, userRole?: string): Promise<{ buffer: Buffer | null; template: Template | null; error?: string }> {
    const template = await this.getTemplateById(id, userRole);
    if (!template) {
      return { buffer: null, template: null, error: 'Template tidak ditemukan atau Anda tidak memiliki akses' };
    }

    try {
      // Download from file URL using fetch
      const response = await fetch(template.fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return { buffer, template };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download template file';
      return { buffer: null, template: null, error: message };
    }
  }

  // Helper methods
  private validateTemplateInput(data: {
    name: string;
    type: 'Template Only' | 'Generate & Template';
    description?: string;
    fields?: TemplateField[];
  }): { error?: string } {
    // Validate name
    if (!data.name || data.name.trim().length < 3) {
      return { error: 'Nama template minimal 3 karakter' };
    }
    if (data.name.length > 255) {
      return { error: 'Nama template maksimal 255 karakter' };
    }

    // Validate type
    if (!['Template Only', 'Generate & Template'].includes(data.type)) {
      return { error: 'Tipe template tidak valid' };
    }

    // Validate fields for Generate & Template
    if (data.type === 'Generate & Template') {
      if (!data.fields || !Array.isArray(data.fields) || data.fields.length === 0) {
        return { error: 'Fields wajib untuk tipe "Generate & Template" dan tidak boleh kosong' };
      }

      // Validate each field
      for (const field of data.fields) {
        if (!field.variable || !field.label || !field.type) {
          return { error: 'Setiap field harus memiliki variable, label, dan type' };
        }

        if (!['text', 'textarea', 'number', 'date', 'time', 'email', 'select'].includes(field.type)) {
          return { error: `Tipe field tidak valid: ${field.type}` };
        }

        if (field.type === 'select' && (!field.options || field.options.length === 0)) {
          return { error: 'Field dengan tipe select harus memiliki options' };
        }
      }

      // Validate order uniqueness
      const orders = data.fields.map(f => f.order);
      if (new Set(orders).size !== orders.length) {
        return { error: 'Setiap field harus memiliki order yang unik' };
      }
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

