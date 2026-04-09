import { LogbookRepository, CreateLogbookData, UpdateLogbookData } from '@/repositories/logbook.repository';

export class LogbookService {
  constructor(private logbookRepo: LogbookRepository) {}

  /**
   * Create a logbook entry for the student's active internship
   */
  async createLogbook(userId: string, data: { date: string; activity: string; description: string; hours?: number }) {
    const internshipId = await this.logbookRepo.getActiveInternshipId(userId);
    if (!internshipId) {
      throw new Error('No active internship found. You must have an active internship to create logbook entries.');
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
      throw new Error('No active internship found.');
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
      throw new Error('No active internship found.');
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
      throw new Error('Logbook entry not found.');
    }

    const internshipId = await this.logbookRepo.getActiveInternshipId(userId);
    if (!internshipId || entry.internshipId !== internshipId) {
      throw new Error('Logbook entry not found or access denied.');
    }

    return entry;
  }

  /**
   * Update a logbook entry (only PENDING entries can be modified)
   */
  async updateLogbook(userId: string, logbookId: string, data: UpdateLogbookData) {
    const entry = await this.getLogbookById(userId, logbookId);

    if (entry.status !== 'PENDING') {
      throw new Error(`Cannot edit a logbook entry with status '${entry.status}'. Only PENDING entries can be modified.`);
    }

    return this.logbookRepo.update(logbookId, data);
  }

  /**
   * Delete a logbook entry (only PENDING entries can be deleted)
   */
  async deleteLogbook(userId: string, logbookId: string) {
    const entry = await this.getLogbookById(userId, logbookId);

    if (entry.status !== 'PENDING') {
      throw new Error(`Cannot delete a logbook entry with status '${entry.status}'. Only PENDING entries can be deleted.`);
    }

    await this.logbookRepo.delete(logbookId);
  }

  /**
   * Submit a logbook entry for mentor review
   */
  async submitLogbook(userId: string, logbookId: string) {
    const entry = await this.getLogbookById(userId, logbookId);

    if (entry.status !== 'PENDING') {
      throw new Error(`Logbook entry status is '${entry.status}'. Only PENDING entries can be submitted.`);
    }

    return this.logbookRepo.submit(logbookId);
  }
}
