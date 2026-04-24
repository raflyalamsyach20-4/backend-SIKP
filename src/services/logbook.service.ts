import { LogbookRepository, CreateLogbookData, UpdateLogbookData } from '@/repositories/logbook.repository';
import { StorageService } from './storage.service';
import { createError } from '@/utils/helpers';

export class LogbookService {
  constructor(
    private logbookRepo: LogbookRepository,
    private storageService: StorageService
  ) {}

  /**
   * Create a logbook entry for the student's active internship
   */
  async createLogbook(userId: string, data: { date: string; activity: string; description: string; hours?: number }) {
    const internshipId = await this.logbookRepo.getActiveInternshipId(userId);
    if (!internshipId) {
      throw createError('No active internship found. You must have an active internship to create logbook entries.', 404);
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
      throw createError('No active internship found.', 404);
    }

    const entries = await this.logbookRepo.findByInternshipId(internshipId);
    return { internshipId, entries };
  }

  /**
   * Get logbook stats for the student's active internship
   */
  async getLogbookStats(userId: string) {
    const internshipId = await this.logbookRepo.getActiveInternshipId(userId);
    if (!internshipId) {
      throw createError('No active internship found.', 404);
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
      throw createError('Logbook entry not found.', 404);
    }

    const internshipId = await this.logbookRepo.getActiveInternshipId(userId);
    if (!internshipId || entry.internshipId !== internshipId) {
      throw createError('Logbook entry not found or access denied.', 403);
    }

    return entry;
  }

  /**
   * Update a logbook entry (only PENDING entries can be modified)
   */
  async updateLogbook(userId: string, logbookId: string, data: UpdateLogbookData) {
    const entry = await this.getLogbookById(userId, logbookId);

    if (entry.status !== 'PENDING') {
      throw createError(`Cannot edit a logbook entry with status '${entry.status}'. Only PENDING entries can be modified.`, 400);
    }

    return this.logbookRepo.update(logbookId, data);
  }

  /**
   * Delete a logbook entry (only PENDING entries can be deleted)
   */
  async deleteLogbook(userId: string, logbookId: string) {
    const entry = await this.getLogbookById(userId, logbookId);

    if (entry.status !== 'PENDING') {
      throw createError(`Cannot delete a logbook entry with status '${entry.status}'. Only PENDING entries can be deleted.`, 400);
    }

    await this.logbookRepo.delete(logbookId);
  }

  /**
   * Submit a logbook entry for mentor review
   */
  async submitLogbook(userId: string, logbookId: string) {
    const entry = await this.getLogbookById(userId, logbookId);

    if (entry.status !== 'PENDING') {
      throw createError(`Logbook entry status is '${entry.status}'. Only PENDING entries can be submitted.`, 400);
    }

    return this.logbookRepo.submit(logbookId);
  }

  /**
   * Upload and attach a photo to a logbook entry
   */
  async uploadPhoto(userId: string, logbookId: string, file: File) {
    const entry = await this.getLogbookById(userId, logbookId);

    // Upload to storage
    const path = `logbooks/${logbookId}/${Date.now()}_${file.name}`;
    const url = await this.storageService.uploadFile(file, path);

    // Update database
    return this.logbookRepo.update(logbookId, { photoUrl: url.url });
  }
}
