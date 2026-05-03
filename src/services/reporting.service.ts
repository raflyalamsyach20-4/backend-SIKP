import { createDbClient } from '@/db';
import { titleSubmissions, reports, lecturerAssessments, combinedGrades, assessments, internships, titleRevisions } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { generateId } from '@/utils/helpers';
import { StorageService } from './storage.service';

export class ReportingService {
  private db: ReturnType<typeof createDbClient>;
  private storageService: StorageService;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.storageService = new StorageService(this.env);
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
    
    // Check if there is an existing submission
    const existing = await this.db
      .select()
      .from(titleSubmissions)
      .where(eq(titleSubmissions.internshipId, internshipId))
      .limit(1);

    if (existing.length > 0) {
      // If rejected, update and reset to PENDING
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

  /**
   * Get Title Submission Status
   */
  async getTitleSubmission(internshipId: string) {
    const result = await this.db
      .select()
      .from(titleSubmissions)
      .where(eq(titleSubmissions.internshipId, internshipId))
      .limit(1);
    
    return result[0] || null;
  }

  /**
   * Approve Title (Lecturer)
   */
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

  /**
   * Reject Title (Lecturer)
   */
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

  /**
   * Step-by-Step Flow: Submit Report Only
   * Required Title to be APPROVED first (usually)
   */
  async submitReport(internshipId: string, data: { file: File; title?: string; abstract?: string }) {
    const now = new Date();

    // Verify Title is Approved
    const title = await this.getTitleSubmission(internshipId);
    if (!title || title.status !== 'APPROVED') {
      throw new Error('Judul harus disetujui terlebih dahulu sebelum mengunggah laporan.');
    }

    // 1. Upload Report File
    const uniqueFileName = this.storageService.generateUniqueFileName(data.file.name);
    const upload = await this.storageService.uploadFile(
      Buffer.from(await data.file.arrayBuffer()),
      uniqueFileName,
      'reports'
    );

    // Check if report exists
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

  /**
   * Get Report Status
   */
  async getReport(internshipId: string) {
    const result = await this.db
      .select()
      .from(reports)
      .where(eq(reports.internshipId, internshipId))
      .limit(1);
    
    return result[0] || null;
  }

  /**
   * Dosen PA scores the report and triggers combined grade calculation
   */
  async scoreReport(internshipId: string, dosenId: string, scores: {
    formatKesesuaian: number;
    penguasaanMateri: number;
    analisisPerancangan: number;
    sikapEtika: number;
    feedback?: string;
  }) {
    const now = new Date();

    // 1. Calculate Lecturer Score (Average)
    const academicScore = Math.round(
      (scores.formatKesesuaian + scores.penguasaanMateri + scores.analisisPerancangan + scores.sikapEtika) / 4
    );

    // 2. Save Lecturer Assessment
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

    // 3. Update Report Status to APPROVED
    await this.db.update(reports)
      .set({ status: 'APPROVED', approvalStatus: 'APPROVED', reviewedBy: dosenId, reviewedAt: now })
      .where(eq(reports.internshipId, internshipId));

    // 4. Update Title Status to APPROVED (Safe in case it wasn't)
    await this.db.update(titleSubmissions)
      .set({ status: 'APPROVED', approvedBy: dosenId, approvedAt: now })
      .where(eq(titleSubmissions.internshipId, internshipId));

    // 5. Trigger Combined Grade Calculation
    return await this.calculateCombinedGrade(internshipId, lecturerAssessmentId, academicScore);
  }

  /**
   * Internal logic to calculate combined grade (30% Mentor + 70% Dosen)
   */
  private async calculateCombinedGrade(internshipId: string, lecturerAssessmentId: string, academicScore: number) {
    // Get Mentor Assessment
    const mentorAssessmentResult = await this.db
      .select()
      .from(assessments)
      .where(eq(assessments.internshipId, internshipId))
      .limit(1);
    
    const mentorAssessment = mentorAssessmentResult[0];
    const fieldScore = mentorAssessment ? mentorAssessment.totalScore : 0;

    // Calculation: 30% Mentor + 70% Dosen
    const finalScore = Math.round((fieldScore * 0.3) + (academicScore * 0.7));

    // Determine Letter Grade
    let letterGrade = 'E';
    if (finalScore >= 80) letterGrade = 'A';
    else if (finalScore >= 70) letterGrade = 'B';
    else if (finalScore >= 60) letterGrade = 'C';
    else if (finalScore >= 50) letterGrade = 'D';

    // Save Combined Grade
    const id = generateId();
    await this.db.insert(combinedGrades).values({
      id,
      internshipId,
      assessmentId: mentorAssessment?.id || null,
      lecturerAssessmentId,
      fieldScore,
      academicScore,
      finalScore,
      letterGrade,
      status: 'APPROVED',
      calculatedAt: new Date(),
    });

    // 6. Mark Internship as SELESAI
    await this.db.update(internships)
      .set({ status: 'SELESAI', updatedAt: new Date() })
      .where(eq(internships.id, internshipId));

    return { finalScore, letterGrade };
  }
}
