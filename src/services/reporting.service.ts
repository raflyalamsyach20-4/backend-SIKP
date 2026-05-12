import { createDbClient } from '@/db';
import { titleSubmissions, reports, lecturerAssessments, internships } from '@/db/schema';
import { eq, isNull, and, desc } from 'drizzle-orm';
import { generateId } from '@/utils/helpers';
import { StorageService } from './storage.service';
import { AssessmentService } from './assessment.service';
import { AuthSessionRepository } from '@/repositories';

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
      data.file,
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
    const result = await this.db.insert(reports).values({
      id: reportId,
      internshipId,
      title: data.title,
      abstract: data.abstract,
      fileName: upload.key,
      fileUrl: this.storageService.getAssetProxyUrl(upload.url),
      fileType: data.file.type,
      fileSize: data.file.size,
      originalName: data.file.name,
      status: 'SUBMITTED',
      submittedAt: now,
      approvalStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
    }).returning();

    return result[0];
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
        const result = await this.db
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
        return result[0];
      }
      throw new Error('Title submission already exists and is not in a rejected state');
    }

    const id = generateId();
    const result = await this.db.insert(titleSubmissions).values({
      id,
      internshipId,
      proposedTitle: data.title,
      description: data.description || null,
      status: 'PENDING',
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning();
    
    return result[0];
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
    // 1. Approve the title submission
    const result = await this.db
      .update(titleSubmissions)
      .set({
        status: 'APPROVED',
        approvedBy: dosenId,
        approvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(titleSubmissions.id, titleId))
      .returning();

    // 2. Also update the internship's dosenPembimbingId so the student dashboard
    //    can resolve and display the lecturer's name correctly
    if (result.length > 0) {
      const internshipId = result[0].internshipId;
      await this.db
        .update(internships)
        .set({ dosenPembimbingId: dosenId, updatedAt: new Date() })
        .where(eq(internships.id, internshipId));
    }

    return result;
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
      data.file,
      uniqueFileName,
      'reports'
    );

    const existing = await this.db
      .select()
      .from(reports)
      .where(eq(reports.internshipId, internshipId))
      .limit(1);

    if (existing.length > 0) {
      const result = await this.db
        .update(reports)
        .set({
          title: data.title || title.proposedTitle,
          abstract: data.abstract || title.description,
          fileName: upload.key,
          fileUrl: this.storageService.getAssetProxyUrl(upload.url),
          fileType: data.file.type,
          fileSize: data.file.size,
          originalName: data.file.name,
          status: 'SUBMITTED',
          submittedAt: now,
          approvalStatus: 'PENDING',
          updatedAt: now,
        })
        .where(eq(reports.id, existing[0].id))
        .returning();
      
      return result[0];
    }

    const id = generateId();
    const result = await this.db.insert(reports).values({
      id,
      internshipId,
      title: data.title || title.proposedTitle,
      abstract: data.abstract || title.description,
      fileName: upload.key,
      fileUrl: this.storageService.getAssetProxyUrl(upload.url),
      fileType: data.file.type,
      fileSize: data.file.size,
      originalName: data.file.name,
      status: 'SUBMITTED',
      submittedAt: now,
      approvalStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
    }).returning();

    return result[0];
  }

  async getReport(internshipId: string) {
    const result = await this.db
      .select()
      .from(reports)
      .where(eq(reports.internshipId, internshipId))
      .limit(1);
    
    if (!result[0]) return null;
    
    return {
      ...result[0],
      fileUrl: this.storageService.getAssetProxyUrl(result[0].fileUrl)
    };
  }

  /**
   * Backfill dosenPembimbingId for existing internships where it is still null
   * but a title has already been approved (approvedBy contains the dosen's ID).
   * Call this once via an admin endpoint or on startup.
   */
  async backfillDosenPembimbingId(): Promise<{ updated: number; skipped: number }> {
    const approvedTitles = await this.db
      .select()
      .from(titleSubmissions)
      .where(eq(titleSubmissions.status, 'APPROVED'));

    let updated = 0;
    let skipped = 0;

    const authSessionRepo = new AuthSessionRepository(this.db);

    for (const ts of approvedTitles) {
      if (!ts.approvedBy) { skipped++; continue; }

      let resolvedDosenId = ts.approvedBy;

      // If it looks like a CUID (not a UUID), try to find the real dosen identity ID from snapshots
      if (!ts.approvedBy.includes('-')) {
        const snapshot = await authSessionRepo.findProfileSnapshotByMahasiswaId(ts.approvedBy);
        if (snapshot) {
          const dsnIdentity = Array.isArray(snapshot.identities) 
            ? snapshot.identities.find((i: any) => i.role === 'DOSEN' || i.identityType === 'DOSEN')
            : snapshot.identities?.dosen;
          
          if (dsnIdentity?.id) {
            console.log(`[ReportingService.backfill] Resolving CUID ${ts.approvedBy} to Identity ID ${dsnIdentity.id}`);
            resolvedDosenId = dsnIdentity.id;
          }
        }
      }

      const result = await this.db
        .update(internships)
        .set({ dosenPembimbingId: resolvedDosenId, updatedAt: new Date() })
        .where(eq(internships.id, ts.internshipId)) // Force update even if not null, to fix the ID format
        .returning();

      if (result.length > 0) updated++;
      else skipped++;
    }

    console.log(`[ReportingService.backfillDosenPembimbingId] updated=${updated}, skipped=${skipped}`);
    return { updated, skipped };
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

  /**
   * For Lecturer Dashboard: List all reports from students assigned to this lecturer
   */
  async getMenteesReports(dosenId: string) {
    const results = await this.db
      .select({
        report: reports,
        internship: internships,
      })
      .from(reports)
      .innerJoin(internships, eq(reports.internshipId, internships.id))
      .where(eq(internships.dosenPembimbingId, dosenId))
      .orderBy(desc(reports.submittedAt));

    const authSessionRepo = new AuthSessionRepository(this.db);
    const enrichedResults = [];

    for (const r of results) {
      let studentName = r.internship.mahasiswaId;
      let studentNim = r.internship.mahasiswaId;

      const snapshot = await authSessionRepo.findProfileSnapshotByMahasiswaId(r.internship.mahasiswaId);
      if (snapshot) {
        studentName = snapshot.nama || snapshot.fullName || snapshot.name || r.internship.mahasiswaId;
        // In SsoProfileData, identity details are often in an array or object
        const mhsIdentity = Array.isArray(snapshot.identities) 
          ? snapshot.identities.find((i: any) => i.role === 'MAHASISWA' || i.identityType === 'MAHASISWA')
          : snapshot.identities?.mahasiswa;
        
        if (mhsIdentity?.nim) {
          studentNim = mhsIdentity.nim;
        }
      }

      enrichedResults.push({
        ...r.report,
        fileUrl: this.storageService.getAssetProxyUrl(r.report.fileUrl),
        companyName: r.internship.companyName,
        mahasiswaId: r.internship.mahasiswaId,
        studentName,
        studentNim,
      });
    }
    
    return enrichedResults;
  }

  async approveReport(reportId: string, dosenId: string) {
    const now = new Date();
    return await this.db
      .update(reports)
      .set({
        status: 'APPROVED',
        approvalStatus: 'APPROVED',
        reviewedBy: dosenId,
        reviewedAt: now,
        updatedAt: now
      })
      .where(eq(reports.id, reportId))
      .returning();
  }

  async rejectReport(reportId: string, dosenId: string, notes: string) {
    const now = new Date();
    return await this.db
      .update(reports)
      .set({
        status: 'REJECTED',
        approvalStatus: 'REJECTED',
        reviewedBy: dosenId,
        reviewedAt: now,
        revisionNotes: notes,
        updatedAt: now
      })
      .where(eq(reports.id, reportId))
      .returning();
  }
}
