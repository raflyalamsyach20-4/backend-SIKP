import { createDbClient } from '@/db';
import { titleSubmissions, reports, lecturerAssessments, internships } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateId } from '@/utils/helpers';
import { StorageService } from './storage.service';
import { AssessmentService } from './assessment.service';

export class ReportingService {
  private db: ReturnType<typeof createDbClient>;
  private storageService: StorageService;
  private assessmentService: AssessmentService;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.storageService = new StorageService(this.env);
    this.assessmentService = new AssessmentService(this.env);
  }

  /**
   * Submit Title and Report in one step (Simplified Flow / Fast Track)
   */
  async submitTitleAndReport(internshipId: string, data: { title: string; abstract: string; file: File }) {
    const now = new Date();
    
    // 1. Upload Report File
    const uniqueFileName = this.storageService.generateUniqueFileName(data.file.name);
    const upload = await this.storageService.uploadFile(
      Buffer.from(await data.file.arrayBuffer()),
      uniqueFileName,
      'reports'
    );

    // 2. Insert Title Submission
    const titleId = generateId();
    await this.db.insert(titleSubmissions).values({
      id: titleId,
      internshipId,
      proposedTitle: data.title,
      description: data.abstract,
      status: 'PENDING',
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 3. Insert Report
    const reportId = generateId();
    await this.db.insert(reports).values({
      id: reportId,
      internshipId,
      title: data.title,
      abstract: data.abstract,
      fileUrl: upload.url,
      fileName: data.file.name,
      fileSize: data.file.size,
      status: 'SUBMITTED',
      submittedAt: now,
      approvalStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });

    return { titleId, reportId };
  }

  /**
   * Step-by-Step Flow: Submit Title Only
   */
  async submitTitle(internshipId: string, data: { title: string; description?: string }) {
    const now = new Date();
    
    const existing = await this.db
      .select()
      .from(titleSubmissions)
      .where(eq(titleSubmissions.internshipId, internshipId))
      .limit(1);

    if (existing.length > 0) {
      if (existing[0].status === 'REJECTED') {
        return await this.db
          .update(titleSubmissions)
          .set({
            proposedTitle: data.title,
            description: data.description || null,
            status: 'PENDING',
            submittedAt: now,
            updatedAt: now,
            rejectionReason: null
          })
          .where(eq(titleSubmissions.id, existing[0].id))
          .returning();
      }
      throw new Error('Title submission already exists and is not in a rejected state');
    }

    const id = generateId();
    return await this.db.insert(titleSubmissions).values({
      id,
      internshipId,
      proposedTitle: data.title,
      description: data.description || null,
      status: 'PENDING',
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning();
  }

  async getTitleSubmission(internshipId: string) {
    const result = await this.db
      .select()
      .from(titleSubmissions)
      .where(eq(titleSubmissions.internshipId, internshipId))
      .limit(1);
    
    return result[0] || null;
  }

  async approveTitle(titleId: string, dosenId: string) {
    return await this.db
      .update(titleSubmissions)
      .set({
        status: 'APPROVED',
        approvedBy: dosenId,
        approvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(titleSubmissions.id, titleId))
      .returning();
  }

  async rejectTitle(titleId: string, dosenId: string, reason: string) {
    return await this.db
      .update(titleSubmissions)
      .set({
        status: 'REJECTED',
        rejectionReason: reason,
        updatedAt: new Date()
      })
      .where(eq(titleSubmissions.id, titleId))
      .returning();
  }

  async submitReport(internshipId: string, data: { file: File; title?: string; abstract?: string }) {
    const now = new Date();

    const title = await this.getTitleSubmission(internshipId);
    if (!title || title.status !== 'APPROVED') {
      throw new Error('Judul harus disetujui terlebih dahulu sebelum mengunggah laporan.');
    }

    const uniqueFileName = this.storageService.generateUniqueFileName(data.file.name);
    const upload = await this.storageService.uploadFile(
      Buffer.from(await data.file.arrayBuffer()),
      uniqueFileName,
      'reports'
    );

    const existing = await this.db
      .select()
      .from(reports)
      .where(eq(reports.internshipId, internshipId))
      .limit(1);

    if (existing.length > 0) {
      return await this.db
        .update(reports)
        .set({
          title: data.title || title.proposedTitle,
          abstract: data.abstract || title.description,
          fileUrl: upload.url,
          fileName: data.file.name,
          fileSize: data.file.size,
          status: 'SUBMITTED',
          submittedAt: now,
          approvalStatus: 'PENDING',
          updatedAt: now,
        })
        .where(eq(reports.id, existing[0].id))
        .returning();
    }

    const id = generateId();
    return await this.db.insert(reports).values({
      id,
      internshipId,
      title: data.title || title.proposedTitle,
      abstract: data.abstract || title.description,
      fileUrl: upload.url,
      fileName: data.file.name,
      fileSize: data.file.size,
      status: 'SUBMITTED',
      submittedAt: now,
      approvalStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
    }).returning();
  }

  async getReport(internshipId: string) {
    const result = await this.db
      .select()
      .from(reports)
      .where(eq(reports.internshipId, internshipId))
      .limit(1);
    
    return result[0] || null;
  }

  async scoreReport(internshipId: string, dosenId: string, scores: {
    formatKesesuaian: number;
    penguasaanMateri: number;
    analisisPerancangan: number;
    sikapEtika: number;
    feedback?: string;
  }) {
    const now = new Date();

    const academicScore = Math.round(
      (scores.formatKesesuaian + scores.penguasaanMateri + scores.analisisPerancangan + scores.sikapEtika) / 4
    );

    const lecturerAssessmentId = generateId();
    await this.db.insert(lecturerAssessments).values({
      id: lecturerAssessmentId,
      internshipId,
      dosenId,
      formatKesesuaian: scores.formatKesesuaian,
      penguasaanMateri: scores.penguasaanMateri,
      analisisPerancangan: scores.analisisPerancangan,
      sikapEtika: scores.sikapEtika,
      totalScore: academicScore,
      feedback: scores.feedback,
      assessedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await this.db.update(reports)
      .set({ status: 'APPROVED', approvalStatus: 'APPROVED', reviewedBy: dosenId, reviewedAt: now })
      .where(eq(reports.internshipId, internshipId));

    await this.db.update(titleSubmissions)
      .set({ status: 'APPROVED', approvedBy: dosenId, approvedAt: now })
      .where(eq(titleSubmissions.internshipId, internshipId));

    return await this.assessmentService.calculateCombinedGrade(internshipId, lecturerAssessmentId, academicScore);
  }
}
