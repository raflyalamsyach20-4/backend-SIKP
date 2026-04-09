import { eq, and, desc } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { logbooks, internships, mahasiswa, users } from '@/db/schema';
import { generateId } from '@/utils/helpers';

export interface CreateLogbookData {
  internshipId: string;
  date: string;
  activity: string;
  description: string;
  hours?: number;
}

export interface UpdateLogbookData {
  date?: string;
  activity?: string;
  description?: string;
  hours?: number;
}

export class LogbookRepository {
  constructor(private db: DbClient) {}

  /**
   * Get active internship ID for a mahasiswa by userId
   */
  async getActiveInternshipId(userId: string): Promise<string | null> {
    const result = await this.db
      .select({ internshipId: internships.id })
      .from(internships)
      .innerJoin(mahasiswa, eq(internships.mahasiswaId, mahasiswa.nim))
      .where(
        and(
          eq(mahasiswa.id, userId),
          eq(internships.status, 'AKTIF')
        )
      )
      .limit(1);
    return result[0]?.internshipId ?? null;
  }

  /**
   * Create a new logbook entry
   */
  async create(data: CreateLogbookData) {
    const id = generateId();
    const now = new Date();
    await this.db.insert(logbooks).values({
      id,
      internshipId: data.internshipId,
      date: data.date,
      activity: data.activity,
      description: data.description,
      hours: data.hours ?? 0,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });
    return this.findById(id);
  }

  /**
   * Get all logbook entries for an internship
   */
  async findByInternshipId(internshipId: string) {
    return this.db
      .select()
      .from(logbooks)
      .where(eq(logbooks.internshipId, internshipId))
      .orderBy(desc(logbooks.date));
  }

  /**
   * Get a single logbook entry by id
   */
  async findById(id: string) {
    const result = await this.db
      .select()
      .from(logbooks)
      .where(eq(logbooks.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Update logbook entry (only PENDING entries can be updated)
   */
  async update(id: string, data: UpdateLogbookData) {
    const fields: Record<string, any> = { updatedAt: new Date() };
    if (data.date !== undefined) fields.date = data.date;
    if (data.activity !== undefined) fields.activity = data.activity;
    if (data.description !== undefined) fields.description = data.description;
    if (data.hours !== undefined) fields.hours = data.hours;

    await this.db.update(logbooks).set(fields).where(eq(logbooks.id, id));
    return this.findById(id);
  }

  /**
   * Delete a logbook entry
   */
  async delete(id: string): Promise<void> {
    await this.db.delete(logbooks).where(eq(logbooks.id, id));
  }

  /**
   * Get logbook stats for an internship
   */
  async getStats(internshipId: string) {
    const all = await this.db
      .select({
        status: logbooks.status,
        hours: logbooks.hours,
      })
      .from(logbooks)
      .where(eq(logbooks.internshipId, internshipId));

    const total = all.length;
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    let totalHours = 0;
    let approvedHours = 0;

    for (const entry of all) {
      const h = entry.hours ?? 0;
      totalHours += h;
      if (entry.status === 'APPROVED') { approved++; approvedHours += h; }
      else if (entry.status === 'PENDING') pending++;
      else if (entry.status === 'REJECTED') rejected++;
    }

    return { total, approved, pending, rejected, totalHours, approvedHours };
  }

  /**
   * Submit a logbook for review (change PENDING → PENDING stays, but marks it as submitted)
   * Since schema only has PENDING/APPROVED/REJECTED, "submit" means keeping PENDING status
   * but we mark updated_at. Mentor sees all PENDING as awaiting review.
   */
  async submit(id: string) {
    // Mark updated so mentor knows the student explicitly submitted
    await this.db
      .update(logbooks)
      .set({ updatedAt: new Date() })
      .where(and(eq(logbooks.id, id), eq(logbooks.status, 'PENDING')));
    return this.findById(id);
  }

  /**
   * Approve a logbook entry (mentor action)
   */
  async approve(id: string, verifiedBy: string) {
    const now = new Date();
    await this.db
      .update(logbooks)
      .set({ status: 'APPROVED', verifiedBy, verifiedAt: now, updatedAt: now })
      .where(eq(logbooks.id, id));
    return this.findById(id);
  }

  /**
   * Reject a logbook entry with reason (mentor action)
   */
  async reject(id: string, verifiedBy: string, rejectionReason: string) {
    const now = new Date();
    await this.db
      .update(logbooks)
      .set({ status: 'REJECTED', rejectionReason, verifiedBy, verifiedAt: now, updatedAt: now })
      .where(eq(logbooks.id, id));
    return this.findById(id);
  }

  /**
   * Approve all PENDING logbooks for an internship (mentor action)
   */
  async approveAll(internshipId: string, verifiedBy: string) {
    const now = new Date();
    await this.db
      .update(logbooks)
      .set({ status: 'APPROVED', verifiedBy, verifiedAt: now, updatedAt: now })
      .where(and(eq(logbooks.internshipId, internshipId), eq(logbooks.status, 'PENDING')));
  }

  /**
   * Get all logbooks for a student's internship (used by mentor)
   */
  async findByInternshipIdForMentor(internshipId: string) {
    return this.findByInternshipId(internshipId);
  }

  /**
   * Get internship by mahasiswa userId and mentor id 
   * (ensures mentor can only view their own mentees' logbooks)
   */
  async getInternshipForMentee(menteeUserId: string, mentorId: string): Promise<string | null> {
    const result = await this.db
      .select({ id: internships.id })
      .from(internships)
      .innerJoin(mahasiswa, eq(internships.mahasiswaId, mahasiswa.nim))
      .where(
        and(
          eq(mahasiswa.id, menteeUserId),
          eq(internships.pembimbingLapanganId, mentorId)
        )
      )
      .limit(1);
    return result[0]?.id ?? null;
  }
}
