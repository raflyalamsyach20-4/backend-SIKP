import { createDbClient } from '@/db';
import { LogbookRepository, CreateLogbookData, UpdateLogbookData } from '@/repositories/logbook.repository';
import { StorageService } from './storage.service';

export class LogbookService {
  private logbookRepo: LogbookRepository;
  private storageService: StorageService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.logbookRepo = new LogbookRepository(db);
    this.storageService = new StorageService(this.env);
  }

  private createServiceError(message: string, code: string, statusCode: number) {
    const error = new Error(message) as Error & { code: string; statusCode: number };
    error.code = code;
    error.statusCode = statusCode;
    return error;
  }

  /**
   * Create a logbook entry for the student's active internship
   */
  async createLogbook(userId: string, data: { date: string; activity: string; description: string; hours?: number }) {
    const internshipId = await this.logbookRepo.getActiveInternshipId(userId);
    if (!internshipId) {
      throw this.createServiceError('No active internship found. You must have an active internship to create logbook entries.', 'INTERNSHIP_NOT_FOUND', 404);
    }

    const logbook = await this.logbookRepo.create({
      internshipId,
      date: data.date,
      activity: data.activity,
      description: data.description,
      hours: data.hours,
    });

    return logbook;
  }

  /**
   * Get all logbook entries for the student's active internship
   */
  async getLogbooks(userId: string) {
    const internshipId = await this.logbookRepo.getActiveInternshipId(userId);
    if (!internshipId) {
      throw this.createServiceError('No active internship found.', 'INTERNSHIP_NOT_FOUND', 404);
    }

    const entries = await this.logbookRepo.findByInternshipId(internshipId);
    
    const enrichedEntries = entries.map(entry => ({
      ...entry,
      attachmentUrl: this.storageService.getAssetProxyUrl(entry.attachmentUrl)
    }));

    return { internshipId, entries: enrichedEntries };
  }

  /**
   * Get logbook stats for the student's active internship
   */
  async getLogbookStats(userId: string) {
    const internshipId = await this.logbookRepo.getActiveInternshipId(userId);
    if (!internshipId) {
      throw this.createServiceError('No active internship found.', 'INTERNSHIP_NOT_FOUND', 404);
    }

    const stats = await this.logbookRepo.getStats(internshipId);
    return { internshipId, ...stats };
  }

  /**
   * Get a single logbook entry (must belong to student's internship)
   */
  async getLogbookById(userId: string, logbookId: string) {
    const entry = await this.logbookRepo.findById(logbookId);
    if (!entry) {
      throw this.createServiceError('Logbook entry not found.', 'LOGBOOK_NOT_FOUND', 404);
    }

    const internshipId = await this.logbookRepo.getActiveInternshipId(userId);
    if (!internshipId || entry.internshipId !== internshipId) {
      throw this.createServiceError('Logbook entry not found or access denied.', 'LOGBOOK_ACCESS_DENIED', 403);
    }

    return {
      ...entry,
      attachmentUrl: this.storageService.getAssetProxyUrl(entry.attachmentUrl)
    };
  }

  /**
   * Update a logbook entry (only PENDING entries can be modified)
   */
  async updateLogbook(userId: string, logbookId: string, data: UpdateLogbookData) {
    const entry = await this.getLogbookById(userId, logbookId);

    if (entry.status !== 'PENDING') {
      throw this.createServiceError(`Cannot edit a logbook entry with status '${entry.status}'. Only PENDING entries can be modified.`, 'LOGBOOK_NOT_PENDING', 400);
    }

    return this.logbookRepo.update(logbookId, data);
  }

  /**
   * Delete a logbook entry (only PENDING entries can be deleted)
   */
  async deleteLogbook(userId: string, logbookId: string) {
    const entry = await this.getLogbookById(userId, logbookId);

    if (entry.status !== 'PENDING') {
      throw this.createServiceError(`Cannot delete a logbook entry with status '${entry.status}'. Only PENDING entries can be deleted.`, 'LOGBOOK_NOT_PENDING', 400);
    }

    await this.logbookRepo.delete(logbookId);
  }

  /**
   * Submit a logbook entry for mentor review
   */
  async submitLogbook(userId: string, logbookId: string) {
    const entry = await this.getLogbookById(userId, logbookId);

    if (entry.status !== 'PENDING') {
      throw this.createServiceError(`Logbook entry status is '${entry.status}'. Only PENDING entries can be submitted.`, 'LOGBOOK_NOT_PENDING', 400);
    }

    return this.logbookRepo.submit(logbookId);
  }

  /**
   * Upload and attach a photo to a logbook entry
   */
  async uploadPhoto(userId: string, logbookId: string, file: File) {
    const entry = await this.getLogbookById(userId, logbookId);

    // Only allow photo upload if logbook is in PENDING status
    if (entry.status !== 'PENDING') {
      throw this.createServiceError(`Cannot upload photo to a logbook entry with status '${entry.status}'. Only PENDING entries can be modified.`, 'LOGBOOK_NOT_PENDING', 400);
    }

    // Validate file type
    const allowedTypes = ['jpg', 'jpeg', 'png', 'webp'];
    if (!this.storageService.validateFileType(file.name, allowedTypes)) {
      throw this.createServiceError('Invalid file type. Only JPG, PNG, and WEBP images are allowed.', 'INVALID_FILE_TYPE', 400);
    }

    // Validate file size (2MB)
    const maxSizeMB = 2;
    if (!this.storageService.validateFileSize(file.size, maxSizeMB)) {
      throw this.createServiceError(`File size exceeds ${maxSizeMB}MB limit.`, 'FILE_SIZE_EXCEEDED', 400);
    }

    // Delete existing attachment from storage if it exists
    if (entry.attachmentKey) {
      try {
        await this.storageService.deleteFile(entry.attachmentKey);
      } catch (err) {
        console.warn('⚠️ [LogbookService] Failed to delete old attachment from storage:', err);
      }
    }

    // Upload to storage
    const uniqueFileName = this.storageService.generateUniqueFileName(file.name);
    const folder = 'logbooks';
    
    const { url, key } = await this.storageService.uploadFile(
      file,
      uniqueFileName,
      folder,
      file.type
    );

    // Update database
    const updated = await this.logbookRepo.update(logbookId, { 
      attachmentUrl: url,
      attachmentKey: key
    });

    if (!updated) return null;

    return {
      ...updated,
      attachmentUrl: this.storageService.getAssetProxyUrl(updated.attachmentUrl)
    };
  }
}

