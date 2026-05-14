import { createDbClient } from '../db';
import { MentorWorkflowRepository } from '../repositories/mentor-workflow.repository';
import { generateId } from '../utils/helpers';
import { AuthService } from './auth.service';
import { MahasiswaService } from './mahasiswa.service';
import { AuthSessionRepository } from '../repositories/auth-session.repository';

export class MentorWorkflowService {
  private workflowRepo: MentorWorkflowRepository;
  private authService: AuthService;
  private mahasiswaService: MahasiswaService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.workflowRepo = new MentorWorkflowRepository(db);
    this.authService = new AuthService(this.env);
    this.mahasiswaService = new MahasiswaService(this.env);
  }

  private createServiceError(message: string, code: string, statusCode: number) {
    const error = new Error(message) as Error & { code: string; statusCode: number };
    error.code = code;
    error.statusCode = statusCode;
    return error;
  }

  async submitMentorApprovalRequest(studentUserId: string, data: {
    mentorName: string;
    mentorEmail: string;
    mentorPhone?: string;
    companyName?: string;
    position?: string;
    companyAddress?: string;
  }) {
    const id = generateId();
    const request = await this.workflowRepo.createMentorApprovalRequest({
      id,
      studentUserId,
      mentorName: data.mentorName,
      mentorEmail: data.mentorEmail.toLowerCase(),
      mentorPhone: data.mentorPhone ?? null,
      companyName: data.companyName ?? null,
      position: data.position ?? null,
      companyAddress: data.companyAddress ?? null,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: studentUserId,
      action: 'CREATE_MENTOR_APPROVAL_REQUEST',
      entityType: 'mentor_approval_requests',
      entityId: id,
      details: { studentUserId, mentorEmail: data.mentorEmail },
      createdAt: new Date(),
    });

    return request;
  }

  /**
   * Normalize status to lowercase for frontend consistency.
   * Frontend depends on 'pending' | 'approved' | 'rejected' (lowercase).
   */
  private normalizeStatus(status: string): 'pending' | 'approved' | 'rejected' {
    return status.toLowerCase() as 'pending' | 'approved' | 'rejected';
  }

  async listMentorApprovalRequests(reviewerUserId: string, sessionId: string, userRole?: string) {
    const requests = await this.workflowRepo.listMentorApprovalRequests();
    const authSessionRepo = new AuthSessionRepository(createDbClient(this.env.DATABASE_URL));

    const results = await Promise.all(requests.map(async (req: any) => {
      try {
        // Bypass filtering for admins
        if (userRole === 'admin' || userRole === 'wakil_dekan') {
          // Still need to resolve student info for display
          let studentProfile;
          try {
            studentProfile = await this.mahasiswaService.getMahasiswaById(req.studentUserId, sessionId);
          } catch {
            studentProfile = await authSessionRepo.findProfileSnapshotByMahasiswaId(req.studentUserId);
          }
          
          const ssoProfile = studentProfile?.profile || studentProfile;
          return {
            ...req,
            status: this.normalizeStatus(req.status),
            studentName: ssoProfile?.fullName || ssoProfile?.name || `Mahasiswa (${req.studentUserId})`,
            studentNim: studentProfile?.nim || ssoProfile?.identities?.mahasiswa?.nim || '-',
            studentEmail: ssoProfile?.emails?.find((e: any) => e.isPrimary)?.email || ssoProfile?.emails?.[0]?.email || '-',
          };
        }
        
        // 1. Get student profile from SSO
        let studentProfile;
        try {
          studentProfile = await this.mahasiswaService.getMahasiswaById(req.studentUserId, sessionId);
        } catch {
          // Fallback to local auth_sessions table
          studentProfile = await authSessionRepo.findProfileSnapshotByMahasiswaId(req.studentUserId);
        }

        if (!studentProfile) return null;

        // 2. Check Authorization (Dosen PA or Dosen Pembimbing)
        const ssoProfile = studentProfile.profile || studentProfile;
        // Look for dosenPA in root studentProfile or profile sub-object
        const dosenPaData = studentProfile.dosenPA || ssoProfile.dosenPA;
        
        let isAuthorized = false;
        
        if (dosenPaData) {
          isAuthorized = dosenPaData.profileId === reviewerUserId || dosenPaData.id === reviewerUserId;
        }
        
        if (!isAuthorized) {
          const internship = await this.workflowRepo.getActiveInternshipByMahasiswaId(req.studentUserId);
          if (internship && (
            internship.dosenPembimbingId === reviewerUserId ||
            (internship as any).dosenPaId === reviewerUserId
          )) {
            isAuthorized = true;
          }
        }

        // If not authorized, filter it out
        if (!isAuthorized) return null;

        // 3. Map to UI structure
        return {
          ...req,
          status: this.normalizeStatus(req.status),
          studentName: ssoProfile.fullName || ssoProfile.name || `Mahasiswa (${req.studentUserId})`,
          studentNim: studentProfile.nim || ssoProfile.identities?.mahasiswa?.nim || '-',
          studentEmail: ssoProfile.emails?.find((e: any) => e.isPrimary)?.email || ssoProfile.emails?.[0]?.email || '-',
        };
      } catch (err) {
        console.error(`[MentorWorkflowService.listMentorApprovalRequests] Error processing request ${req.id}:`, err);
        return null;
      }
    }));

    // Filter out nulls (unauthorized or error)
    return results.filter(r => r !== null);
  }

  async getMyMentorRequest(studentUserId: string, sessionId: string) {
    const requests = await this.workflowRepo.listMentorApprovalRequestsByStudent(studentUserId);
    const authSessionRepo = new AuthSessionRepository(createDbClient(this.env.DATABASE_URL));

    return Promise.all(requests.map(async (req: any) => {
      try {
        const studentProfile = await this.mahasiswaService.getMahasiswaById(req.studentUserId, sessionId);
        if (!studentProfile) throw new Error('Not found in SSO');

        return {
          ...req,
          status: this.normalizeStatus(req.status),
          studentName: studentProfile?.profile?.fullName || `Mahasiswa (${req.studentUserId})`,
          studentNim: studentProfile?.nim || '-',
          studentEmail: studentProfile?.profile?.emails?.find(e => e.isPrimary)?.email || '-',
        };
      } catch {
        try {
          const snapshot = await authSessionRepo.findProfileSnapshotByMahasiswaId(req.studentUserId);
          if (snapshot) {
            return {
              ...req,
              status: this.normalizeStatus(req.status),
              studentName: snapshot.fullName || snapshot.name || `Mahasiswa (${req.studentUserId})`,
              studentNim: snapshot.identities?.mahasiswa?.nim || '-',
              studentEmail: snapshot.emails?.find((e: any) => e.isPrimary)?.email || snapshot.emails?.[0]?.email || '-',
            };
          }
        } catch (err) {}

        return {
          ...req,
          status: this.normalizeStatus(req.status),
          studentName: `Mahasiswa (${req.studentUserId})`,
          studentNim: '-',
          studentEmail: '-',
        };
      }
    }));
  }

  /**
   * Resubmit a rejected mentor approval request.
   * Resets rejectionReason to null so stale rejection messages don't show in the UI.
   */
  async resubmitMentorApprovalRequest(requestId: string, studentUserId: string, data: {
    mentorName: string;
    mentorEmail: string;
    mentorPhone?: string;
    companyName?: string;
    position?: string;
    companyAddress?: string;
  }) {
    const existing = await this.workflowRepo.getMentorApprovalRequestById(requestId);
    if (!existing) throw this.createServiceError('Request not found', 'REQUEST_NOT_FOUND', 404);
    if (existing.studentUserId !== studentUserId) throw this.createServiceError('Forbidden', 'FORBIDDEN', 403);
    if (existing.status !== 'REJECTED') throw this.createServiceError('Only rejected requests can be resubmitted', 'INVALID_STATUS', 409);

    // Reset rejectionReason to null — this is the key fix from the catatan tim backend
    const updated = await this.workflowRepo.updateMentorApprovalRequest(requestId, {
      mentorName: data.mentorName,
      mentorEmail: data.mentorEmail.toLowerCase(),
      mentorPhone: data.mentorPhone ?? null,
      companyName: data.companyName ?? null,
      position: data.position ?? null,
      companyAddress: data.companyAddress ?? null,
      status: 'PENDING',
      rejectionReason: null, // <-- Reset alasan penolakan lama
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: new Date(),
    });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: studentUserId,
      action: 'RESUBMIT_MENTOR_APPROVAL_REQUEST',
      entityType: 'mentor_approval_requests',
      entityId: requestId,
      details: { mentorEmail: data.mentorEmail },
      createdAt: new Date(),
    });

    return {
      ...updated,
      status: this.normalizeStatus(updated!.status),
    };
  }

  private async fetchSsoMentorByEmail(email: string, token: string) {
    try {
      const baseUrl = this.env.SSO_BASE_URL;
      const url = `${baseUrl}/api/mentor?email=${encodeURIComponent(email)}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) return null;

      const payload = await response.json() as { success: boolean; data: any };
      if (payload.success && payload.data) {
        // Some SSO APIs return an array for search, others return a single object
        if (Array.isArray(payload.data)) {
          return payload.data[0] || null;
        }
        return payload.data;
      }
      return null;
    } catch (error) {
      console.warn('[MentorWorkflowService.fetchSsoMentorByEmail] Failed to fetch:', error);
      return null;
    }
  }

  private async createSsoMentor(data: {
    fullName: string;
    instansi: string;
    email: string;
    phoneNumber?: string;
    jabatan?: string;
    bidang?: string;
  }, token: string) {
    try {
      const baseUrl = this.env.SSO_BASE_URL;
      const url = `${baseUrl}/api/mentor`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error('[MentorWorkflowService.createSsoMentor] SSO Error:', body);
        throw new Error(`Failed to create mentor in SSO (${response.status})`);
      }

      const payload = await response.json() as { success: boolean; data: any };
      return payload.data;
    } catch (error) {
      console.error('[MentorWorkflowService.createSsoMentor] Error:', error);
      throw error;
    }
  }

  async approveMentorApprovalRequest(requestId: string, reviewerUserId: string, sessionId: string) {
    const request = await this.workflowRepo.getMentorApprovalRequestById(requestId);
    if (!request) throw this.createServiceError('Mentor approval request not found', 'REQUEST_NOT_FOUND', 404);
    if (request.status !== 'PENDING') throw this.createServiceError('Only pending requests can be approved', 'INVALID_STATUS', 409);

    // 1. Verify Dosen PA (Reviewer must be the Dosen PA of the student)
    const studentSso = await this.mahasiswaService.getMahasiswaById(request.studentUserId, sessionId);
    if (!studentSso) {
      throw this.createServiceError('Mahasiswa tidak ditemukan di sistem SSO maupun cache lokal. Pastikan data mahasiswa valid.', 'STUDENT_NOT_FOUND', 404);
    }

    const isDosenPa = studentSso.dosenPA?.profileId === reviewerUserId;
    if (!isDosenPa) {
      const internship = await this.workflowRepo.getActiveInternshipByMahasiswaId(studentSso.id);
      const internshipAny = internship as any;
      const isDosenPembimbing = internship?.dosenPembimbingId === reviewerUserId;
      const isDosenPaById = internshipAny?.dosenPaId === reviewerUserId;
      if (!isDosenPembimbing && !isDosenPaById) {
         throw this.createServiceError('Only the assigned Dosen PA/Pembimbing can approve this request', 'FORBIDDEN_REVIEWER', 403);
      }
    }

    const internship = await this.workflowRepo.getActiveInternshipByMahasiswaId(studentSso.id);
    if (!internship) throw this.createServiceError('No active internship found for this student', 'INTERNSHIP_NOT_FOUND', 404);

    // 2. Resolve Mentor (Check first, then create if missing)
    const accessToken = await this.authService.getSessionAccessTokenOrThrow(sessionId);
    
    let ssoMentor = await this.fetchSsoMentorByEmail(request.mentorEmail, accessToken);
    
    if (!ssoMentor) {
      console.info(`[MentorWorkflowService] Mentor ${request.mentorEmail} not found in SSO. Creating new account using lecturer token...`);
      
      ssoMentor = await this.createSsoMentor({
        fullName: request.mentorName,
        instansi: request.companyName || 'Instansi Terkait',
        email: request.mentorEmail,
        phoneNumber: request.mentorPhone || undefined,
        jabatan: request.position || undefined,
        bidang: '-', // Default empty bidang if not provided
      }, accessToken);
    } else {
      console.info(`[MentorWorkflowService] Mentor ${request.mentorEmail} already exists in SSO. Linking existing profile.`);
    }

    const mentorProfileId = ssoMentor.profileId || ssoMentor.profile?.id || ssoMentor.id;
    const mentorIdFromSso = ssoMentor.id;

    // 3. Assign the mentor (using their SSO profileId) to the internship
    await this.workflowRepo.assignMentorToInternship(internship.id, mentorProfileId);

    // 4. Ensure a signature record exists for this mentor
    await this.workflowRepo.ensureMentorSignatureRecord({
      id: mentorProfileId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const updatedRequest = await this.workflowRepo.updateMentorApprovalRequest(requestId, {
      status: 'APPROVED',
      reviewedBy: reviewerUserId,
      reviewedAt: new Date(),
      ssoMentorId: mentorIdFromSso,
      rejectionReason: null,
    });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: reviewerUserId,
      action: 'APPROVE_MENTOR_APPROVAL_REQUEST',
      entityType: 'mentor_approval_requests',
      entityId: requestId,
      details: { mentorProfileId, ssoMentorId: mentorIdFromSso, internshipId: internship.id },
      createdAt: new Date(),
    });

    return {
      request: updatedRequest,
      ssoMentorId: mentorIdFromSso,
    };
  }

  async rejectMentorApprovalRequest(requestId: string, reviewerUserId: string, reason: string) {
    const request = await this.workflowRepo.getMentorApprovalRequestById(requestId);
    if (!request) throw this.createServiceError('Mentor approval request not found', 'REQUEST_NOT_FOUND', 404);
    if (request.status !== 'PENDING') throw this.createServiceError('Only pending requests can be rejected', 'INVALID_STATUS', 409);

    const updatedRequest = await this.workflowRepo.updateMentorApprovalRequest(requestId, {
      status: 'REJECTED',
      reviewedBy: reviewerUserId,
      reviewedAt: new Date(),
      rejectionReason: reason,
    });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: reviewerUserId,
      action: 'REJECT_MENTOR_APPROVAL_REQUEST',
      entityType: 'mentor_approval_requests',
      entityId: requestId,
      details: { reason },
      createdAt: new Date(),
    });

    return updatedRequest;
  }

  async createMentorEmailChangeRequest(mentorId: string, requestedEmail: string, reason?: string) {
    const req = await this.workflowRepo.createMentorEmailChangeRequest({
      id: generateId(),
      mentorId,
      currentEmail: '', 
      requestedEmail: requestedEmail.toLowerCase(),
      reason: reason ?? null,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return req;
  }

  async listMentorEmailChangeRequests() {
    return this.workflowRepo.listMentorEmailChangeRequests();
  }

  async approveMentorEmailChangeRequest(requestId: string, reviewerUserId: string) {
    const request = await this.workflowRepo.getMentorEmailChangeRequestById(requestId);
    if (!request) throw this.createServiceError('Email change request not found', 'REQUEST_NOT_FOUND', 404);
    if (request.status !== 'PENDING') throw this.createServiceError('Only pending requests can be approved', 'INVALID_STATUS', 409);

    const updatedRequest = await this.workflowRepo.updateMentorEmailChangeRequest(requestId, {
      status: 'APPROVED',
    });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: reviewerUserId,
      action: 'APPROVE_MENTOR_EMAIL_CHANGE_REQUEST',
      entityType: 'mentor_email_change_requests',
      entityId: requestId,
      details: { newEmail: request.requestedEmail },
      createdAt: new Date(),
    });

    // We don't automatically update SSO here yet, as the SSO integration for updating 
    // mentor emails might require additional tokens or APIs. 
    // Usually this serves as a log or triggers an async sync.

    return updatedRequest;
  }

  async rejectMentorEmailChangeRequest(requestId: string, reviewerUserId: string, reason: string) {
    const request = await this.workflowRepo.getMentorEmailChangeRequestById(requestId);
    if (!request) throw this.createServiceError('Email change request not found', 'REQUEST_NOT_FOUND', 404);
    if (request.status !== 'PENDING') throw this.createServiceError('Only pending requests can be rejected', 'INVALID_STATUS', 409);

    const updatedRequest = await this.workflowRepo.updateMentorEmailChangeRequest(requestId, {
      status: 'REJECTED',
      reason: reason,
    });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: reviewerUserId,
      action: 'REJECT_MENTOR_EMAIL_CHANGE_REQUEST',
      entityType: 'mentor_email_change_requests',
      entityId: requestId,
      details: { reason },
      createdAt: new Date(),
    });

    return updatedRequest;
  }

  async getDosenLogbookMonitor() {
    return this.workflowRepo.listDosenLogbookMonitor();
  }

  async getDosenLogbookMonitorByStudent(studentUserId: string) {
    return this.workflowRepo.listDosenLogbookMonitorByStudent(studentUserId);
  }
}
