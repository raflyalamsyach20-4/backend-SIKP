import { createDbClient } from '@/db';
import { MentorRepository, CreateAssessmentData, UpdateAssessmentData } from '@/repositories/mentor.repository';
import { LogbookRepository } from '@/repositories/logbook.repository';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';
import { MahasiswaService } from './mahasiswa.service';

export class MentorService {
  private mentorRepo: MentorRepository;
  private logbookRepo: LogbookRepository;
  private storageService: StorageService;
  private mahasiswaService: MahasiswaService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.mentorRepo = new MentorRepository(db);
    this.logbookRepo = new LogbookRepository(db);
    this.storageService = new StorageService(this.env);
    this.mahasiswaService = new MahasiswaService(this.env);
  }

  private createServiceError(message: string, code: string, statusCode: number) {
    const error = new Error(message) as Error & { code: string; statusCode: number };
    error.code = code;
    error.statusCode = statusCode;
    return error;
  }

  // ─── Profile & Signature ───────────────────────────────────────────────────

  async getProfile(mentorId: string, sessionId: string) {
    // 1. Fetch data from SSO (Master)
    const baseUrl = this.env.SSO_BASE_URL;
    const token = await new AuthService(this.env).getSessionAccessToken(sessionId);
    
    let mentorSso: any = null;
    try {
      const response = await fetch(`${baseUrl}/mentor/${mentorId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const payload = await response.json() as { success: boolean; data: any };
        mentorSso = payload.data;
      }
    } catch (err) {
      console.warn('[MentorService.getProfile] Failed to fetch mentor from SSO:', err);
    }

    // 2. Sync signature from SSO if available
    try {
      await this.syncSignatureFromSso(mentorId, sessionId);
    } catch (err) {
      console.warn('[MentorService.getProfile] Failed to sync signature from SSO:', err);
    }

    // 3. Fetch signature from local DB
    const profile = await this.mentorRepo.findProfileById(mentorId);
    
    return {
      id: mentorId,
      fullName: mentorSso?.fullName || mentorSso?.profile?.fullName || 'Mentor',
      email: mentorSso?.email || mentorSso?.profile?.email || '',
      instansi: mentorSso?.instansi || '',
      jabatan: mentorSso?.jabatan || '',
      signatureUrl: profile?.signatureUrl ? this.storageService.getAssetProxyUrl(profile.signatureUrl) : null,
    };
  }

  /**
   * Sync mentor signature from SSO to local DB
   */
  async syncSignatureFromSso(mentorId: string, sessionId: string) {
    const token = await new AuthService(this.env).getSessionAccessToken(sessionId);
    if (!token) return;

    const baseUrl = this.env.SSO_BASE_URL;
    const signaturePath = this.env.SSO_SIGNATURE_PATH || '/profile/signature';
    
    try {
      const response = await fetch(`${baseUrl}${signaturePath}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) return;

      const payload = await response.json() as any;
      const ssoSignature = payload.data?.activeSignature;

      if (!ssoSignature) return;
      
      let ssoUrl = ssoSignature.signatureImage || ssoSignature.svg || ssoSignature.signatureUrl;
      if (!ssoUrl) return;

      // Handle raw SVG by converting to Data URL
      if (ssoUrl.trim().startsWith('<svg')) {
        console.log(`[MentorService.syncSignatureFromSso] Converting SVG to base64 for mentor ${mentorId}`);
        try {
          const encoded = btoa(unescape(encodeURIComponent(ssoUrl)));
          ssoUrl = `data:image/svg+xml;base64,${encoded}`;
        } catch (e) {
          console.error('[MentorService.syncSignatureFromSso] Failed to encode SVG:', e);
          // Fallback to simpler btoa if trick fails, though trick is safer
          try {
            const encoded = btoa(ssoUrl.replace(/[^\x00-\xFF]/g, " "));
            ssoUrl = `data:image/svg+xml;base64,${encoded}`;
          } catch (e2) {
            console.error('[MentorService.syncSignatureFromSso] Critical failure encoding SVG:', e2);
          }
        }
      }
      
      console.log(`[MentorService.syncSignatureFromSso] Checking local profile for mentor ${mentorId}`);
      const existingProfile = await this.mentorRepo.findProfileById(mentorId);
      
      // Simple sync: update if missing or if we want to ensure it's fresh
      if (!existingProfile || existingProfile.signatureUrl !== ssoUrl) {
        console.log(`[MentorService.syncSignatureFromSso] Updating signature for mentor ${mentorId}`);
        await this.mentorRepo.updateProfile(mentorId, {
          signatureUrl: ssoUrl,
          updatedAt: new Date()
        });
        console.log(`[MentorService.syncSignatureFromSso] Successfully updated signature for mentor ${mentorId}`);
      } else {
        console.log(`[MentorService.syncSignatureFromSso] Signature already up to date for mentor ${mentorId}`);
      }
    } catch (err) {
      console.error('[MentorService.syncSignatureFromSso] Error during sync:', err);
    }
  }

  async updateSignature(mentorId: string, file: File) {
    const mentor = await this.mentorRepo.findProfileById(mentorId);
    if (!mentor) throw this.createServiceError('Mentor profile not found', 'PROFILE_NOT_FOUND', 404);

    // 1. Validate file type (Images only)
    const allowedTypes = ['png', 'jpg', 'jpeg'];
    if (!this.storageService.validateFileType(file.name, allowedTypes)) {
      throw this.createServiceError('Invalid file type. Only PNG and JPEG are allowed for signatures.', 'INVALID_FILE_TYPE', 400);
    }

    // 2. Validate file size (1MB max for signature)
    const maxSizeMB = 1;
    if (!this.storageService.validateFileSize(file.size, maxSizeMB)) {
      throw this.createServiceError(`File size exceeds ${maxSizeMB}MB limit.`, 'FILE_SIZE_EXCEEDED', 400);
    }

    // 3. Delete old signature from storage if exists
    if (mentor.signatureKey) {
      try {
        await this.storageService.deleteFile(mentor.signatureKey);
      } catch (err) {
        console.warn('⚠️ [MentorService] Failed to delete old signature from storage:', err);
      }
    }

    // 4. Upload to R2
    const uniqueFileName = this.storageService.generateUniqueFileName(file.name);
    const folder = `signatures/mentors/${mentorId}`;
    
    const { url, key } = await this.storageService.uploadFile(
      file,
      uniqueFileName,
      folder,
      file.type
    );

    // 5. Update DB
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

  async getMentees(mentorId: string, identityId: string, sessionId: string) {
    const mentees = await this.mentorRepo.getMentees(mentorId, identityId);
    
    // Resolve student details (name, nim, etc) for each mentee
    const enrichedMentees = await Promise.all(mentees.map(async (mentee) => {
      try {
        const studentDetail = await this.mahasiswaService.getMahasiswaById(mentee.studentId, sessionId) as any;
        const profile = studentDetail?.profile || studentDetail;
        
        return {
          ...mentee,
          userId: mentee.studentId,
          nama: profile?.fullName || profile?.name || '-',
          nim: studentDetail?.nim || '-',
          email: profile?.emails?.[0]?.email || '-',
          prodi: studentDetail?.prodi?.nama || profile?.prodi || '-',
          photoUrl: profile?.photoUrl || null
        };
      } catch (error) {
        console.warn(`[MentorService.getMentees] Failed to resolve student ${mentee.studentId}:`, error);
        return {
          ...mentee,
          userId: mentee.studentId,
          nama: 'Mahasiswa',
          nim: '-',
          email: '-',
          prodi: '-'
        };
      }
    }));

    return enrichedMentees;
  }

  async getMenteeById(mentorId: string, identityId: string, studentUserId: string, sessionId: string) {
    const mentee = await this.mentorRepo.getMenteeByStudentId(mentorId, identityId, studentUserId);
    if (!mentee) throw this.createServiceError('Student not found or not supervised by this mentor', 'MENTEE_NOT_FOUND', 404);
    
    try {
      const studentDetail = await this.mahasiswaService.getMahasiswaById(studentUserId, sessionId) as any;
      const profile = studentDetail?.profile || studentDetail;
      
      return {
        ...mentee,
        nama: profile?.fullName || profile?.name || '-',
        nim: studentDetail?.nim || '-',
        email: profile?.emails?.[0]?.email || '-',
        prodi: studentDetail?.prodi?.nama || profile?.prodi || '-',
        photoUrl: profile?.photoUrl || null
      };
    } catch (error) {
      return {
        ...mentee,
        nama: 'Mahasiswa',
        nim: '-',
        email: '-',
        prodi: '-'
      };
    }
  }

  // ─── Logbooks ───────────────────────────────────────────────────────────────

  async getStudentLogbooks(mentorId: string, identityId: string, studentUserId: string, sessionId: string) {
    const internshipId = await this.mentorRepo.getInternshipIdForMentee(mentorId, identityId, studentUserId);
    if (!internshipId) throw this.createServiceError('Student not found or not supervised by this mentor', 'INTERNSHIP_NOT_FOUND', 404);
    const entries = await this.logbookRepo.findByInternshipId(internshipId);
    
    const enrichedEntries = entries.map(entry => {
      const proxiedUrl = entry.fileUrl ? this.storageService.getAssetProxyUrl(entry.fileUrl) : null;
      return {
        ...entry,
        fileUrl: proxiedUrl,
        photoUrl: proxiedUrl // Alias for frontend compatibility
      };
    });

    return { internshipId, entries: enrichedEntries };
  }

  async approveLogbook(mentorId: string, identityId: string, logbookId: string, sessionId: string) {
    const entry = await this.logbookRepo.findById(logbookId);
    if (!entry) throw this.createServiceError('Logbook entry not found', 'LOGBOOK_NOT_FOUND', 404);
    // verify this logbook belongs to a mentee of this mentor (via internship)
    await this.assertLogbookBelongsToMentor(mentorId, identityId, entry.internshipId, sessionId);
    return this.logbookRepo.approve(logbookId, mentorId);
  }

  async rejectLogbook(mentorId: string, identityId: string, logbookId: string, rejectionReason: string, sessionId: string) {
    if (!rejectionReason?.trim()) throw new Error('Rejection reason is required');
    const entry = await this.logbookRepo.findById(logbookId);
    if (!entry) throw this.createServiceError('Logbook entry not found', 'LOGBOOK_NOT_FOUND', 404);
    await this.assertLogbookBelongsToMentor(mentorId, identityId, entry.internshipId, sessionId);
    return this.logbookRepo.reject(logbookId, mentorId, rejectionReason);
  }

  async approveAllLogbooks(mentorId: string, identityId: string, studentUserId: string, sessionId: string) {
    const internshipId = await this.mentorRepo.getInternshipIdForMentee(mentorId, identityId, studentUserId);
    if (!internshipId) throw this.createServiceError('Student not found or not supervised by this mentor', 'INTERNSHIP_NOT_FOUND', 404);
    await this.logbookRepo.approveAll(internshipId, mentorId);
    return { message: 'All pending logbook entries approved', internshipId };
  }

  // ─── Assessments ────────────────────────────────────────────────────────────

  async createAssessment(mentorId: string, identityId: string, data: Omit<CreateAssessmentData, 'internshipId'> & { studentUserId: string }, sessionId: string) {
    const internshipId = await this.mentorRepo.getInternshipIdForMentee(mentorId, identityId, data.studentUserId);
    if (!internshipId) throw this.createServiceError('Student not found or not supervised by this mentor', 'INTERNSHIP_NOT_FOUND', 404);

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

  async getAssessmentByStudent(mentorId: string, identityId: string, studentUserId: string, sessionId: string) {
    const internshipId = await this.mentorRepo.getInternshipIdForMentee(mentorId, identityId, studentUserId);
    if (!internshipId) throw this.createServiceError('Student not found or not supervised by this mentor', 'INTERNSHIP_NOT_FOUND', 404);

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

  private async assertLogbookBelongsToMentor(mentorId: string, identityId: string, internshipId: string, sessionId: string) {
    // The logbook's internship must have this mentor as pembimbingLapanganId
    const mentees = await this.getMentees(mentorId, identityId, sessionId);
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
