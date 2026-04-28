import { createDbClient } from '@/db';
import { MentorRepository, CreateAssessmentData, UpdateAssessmentData } from '@/repositories/mentor.repository';
import { LogbookRepository } from '@/repositories/logbook.repository';
import { StorageService } from './storage.service';

export class MentorService {
  private mentorRepo: MentorRepository;
  private logbookRepo: LogbookRepository;
  private storageService: StorageService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.mentorRepo = new MentorRepository(db);
    this.logbookRepo = new LogbookRepository(db);
    this.storageService = new StorageService(this.env);
  }

  // ─── Profile & Signature ───────────────────────────────────────────────────

  async getProfile(mentorId: string) {
    const profile = await this.mentorRepo.findProfileById(mentorId);
    if (!profile) throw new Error('Mentor profile not found');
    
    return {
      ...profile,
      signatureUrl: this.storageService.getAssetProxyUrl(profile.signatureUrl)
    };
  }

  async updateSignature(mentorId: string, file: File) {
    // 1. Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type. Only PNG and JPEG are allowed for signatures.');
    }

    // 2. Upload to R2
    const fileName = this.storageService.generateUniqueFileName(file.name);
    const folder = `signatures/mentors/${mentorId}`;
    
    const { url, key } = await this.storageService.uploadFile(
      file,
      fileName,
      folder,
      file.type
    );

    // 3. Update DB
    const updated = await this.mentorRepo.updateProfile(mentorId, {
      signatureUrl: url,
      signatureKey: key
    });

    if (!updated) return null;

    return {
      ...updated,
      signatureUrl: this.storageService.getAssetProxyUrl(updated.signatureUrl)
    };
  }


  // ─── Mentees ────────────────────────────────────────────────────────────────

  async getMentees(mentorId: string) {
    return this.mentorRepo.getMentees(mentorId);
  }

  async getMenteeById(mentorId: string, studentUserId: string) {
    const mentee = await this.mentorRepo.getMenteeByStudentId(mentorId, studentUserId);
    if (!mentee) throw new Error('Student not found or not supervised by this mentor');
    return mentee;
  }

  // ─── Logbooks ───────────────────────────────────────────────────────────────

  async getStudentLogbooks(mentorId: string, studentUserId: string) {
    const internshipId = await this.mentorRepo.getInternshipIdForMentee(mentorId, studentUserId);
    if (!internshipId) throw new Error('Student not found or not supervised by this mentor');
    const entries = await this.logbookRepo.findByInternshipId(internshipId);
    return { internshipId, entries };
  }

  async approveLogbook(mentorId: string, logbookId: string) {
    const entry = await this.logbookRepo.findById(logbookId);
    if (!entry) throw new Error('Logbook entry not found');
    // verify this logbook belongs to a mentee of this mentor (via internship)
    await this.assertLogbookBelongsToMentor(mentorId, entry.internshipId);
    return this.logbookRepo.approve(logbookId, mentorId);
  }

  async rejectLogbook(mentorId: string, logbookId: string, rejectionReason: string) {
    if (!rejectionReason?.trim()) throw new Error('Rejection reason is required');
    const entry = await this.logbookRepo.findById(logbookId);
    if (!entry) throw new Error('Logbook entry not found');
    await this.assertLogbookBelongsToMentor(mentorId, entry.internshipId);
    return this.logbookRepo.reject(logbookId, mentorId, rejectionReason);
  }

  async approveAllLogbooks(mentorId: string, studentUserId: string) {
    const internshipId = await this.mentorRepo.getInternshipIdForMentee(mentorId, studentUserId);
    if (!internshipId) throw new Error('Student not found or not supervised by this mentor');
    await this.logbookRepo.approveAll(internshipId, mentorId);
    return { message: 'All pending logbook entries approved', internshipId };
  }

  // ─── Assessments ────────────────────────────────────────────────────────────

  async createAssessment(mentorId: string, data: Omit<CreateAssessmentData, 'internshipId'> & { studentUserId: string }) {
    const internshipId = await this.mentorRepo.getInternshipIdForMentee(mentorId, data.studentUserId);
    if (!internshipId) throw new Error('Student not found or not supervised by this mentor');

    // Check for existing assessment
    const existing = await this.mentorRepo.getAssessmentByInternshipId(internshipId);
    if (existing) throw new Error('Assessment already exists for this student. Use PUT to update it.');

    // Validate score ranges
    this.validateScores(data);

    return this.mentorRepo.createAssessment(mentorId, {
      internshipId,
      kehadiran: data.kehadiran,
      kerjasama: data.kerjasama,
      sikapEtika: data.sikapEtika,
      prestasiKerja: data.prestasiKerja,
      kreatifitas: data.kreatifitas,
      feedback: data.feedback,
    });
  }

  async getAssessmentByStudent(mentorId: string, studentUserId: string) {
    const internshipId = await this.mentorRepo.getInternshipIdForMentee(mentorId, studentUserId);
    if (!internshipId) throw new Error('Student not found or not supervised by this mentor');

    const assessment = await this.mentorRepo.getAssessmentByInternshipId(internshipId);
    return assessment;
  }

  async updateAssessment(mentorId: string, assessmentId: string, data: UpdateAssessmentData) {
    const existing = await this.mentorRepo.findAssessmentById(assessmentId);
    if (!existing) throw new Error('Assessment not found');
    if (existing.pembimbingLapanganId !== mentorId) throw new Error('Access denied: This assessment belongs to a different mentor');

    if (data.kehadiran !== undefined || data.kerjasama !== undefined ||
        data.sikapEtika !== undefined || data.prestasiKerja !== undefined ||
        data.kreatifitas !== undefined) {
      this.validateScores({
        kehadiran: data.kehadiran ?? existing.kehadiran,
        kerjasama: data.kerjasama ?? existing.kerjasama,
        sikapEtika: data.sikapEtika ?? existing.sikapEtika,
        prestasiKerja: data.prestasiKerja ?? existing.prestasiKerja,
        kreatifitas: data.kreatifitas ?? existing.kreatifitas,
      });
    }

    return this.mentorRepo.updateAssessment(assessmentId, data);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async assertLogbookBelongsToMentor(mentorId: string, internshipId: string) {
    // The logbook's internship must have this mentor as pembimbingLapanganId
    const mentees = await this.mentorRepo.getMentees(mentorId);
    const owns = mentees.some(m => m.internshipId === internshipId);
    if (!owns) throw new Error('Access denied: Logbook does not belong to your mentee');
  }

  private validateScores(scores: { kehadiran: number; kerjasama: number; sikapEtika: number; prestasiKerja: number; kreatifitas: number }) {
    const fields = ['kehadiran', 'kerjasama', 'sikapEtika', 'prestasiKerja', 'kreatifitas'] as const;
    for (const field of fields) {
      const v = scores[field];
      if (v < 0 || v > 100) throw new Error(`Score for '${field}' must be between 0 and 100`);
    }
  }
}
