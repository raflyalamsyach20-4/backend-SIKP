import { createDbClient } from '../db';
import { MentorWorkflowRepository } from '../repositories/mentor-workflow.repository';
import { generateId } from '../utils/helpers';
import { AuthService } from './auth.service';
import { MahasiswaService } from './mahasiswa.service';

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

  async listMentorApprovalRequests(sessionId: string) {
    const requests = await this.workflowRepo.listMentorApprovalRequests();

    return Promise.all(requests.map(async (req) => {
      try {
        const studentProfile = await this.mahasiswaService.getMahasiswaById(req.studentUserId, sessionId);
        return {
          ...req,
          status: this.normalizeStatus(req.status),
          studentName: studentProfile?.profile?.fullName || `Mahasiswa (${req.studentUserId})`,
          studentNim: studentProfile?.nim || '-',
          studentEmail: studentProfile?.email || '-',
        };
      } catch {
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

  async getMyMentorRequest(studentUserId: string, sessionId: string) {
    const requests = await this.workflowRepo.listMentorApprovalRequestsByStudent(studentUserId);

    return Promise.all(requests.map(async (req) => {
      try {
        const studentProfile = await this.mahasiswaService.getMahasiswaById(req.studentUserId, sessionId);
        return {
          ...req,
          status: this.normalizeStatus(req.status),
          studentName: studentProfile?.profile?.fullName || `Mahasiswa (${req.studentUserId})`,
          studentNim: studentProfile?.nim || '-',
          studentEmail: studentProfile?.email || '-',
        };
      } catch {
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

  private async createSsoMentor(data: {
    fullName: string;
    instansi: string;
    email: string;
    noTelepon?: string;
    jabatan?: string;
    bidang?: string;
  }) {
    try {
      const token = await this.authService.getServiceAccessToken();
      const baseUrl = this.env.SSO_BASE_URL;
      const url = `${baseUrl}/mentor`;

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
    if (!studentSso) throw this.createServiceError('Student not found in SSO', 'STUDENT_NOT_FOUND', 404);

    const isDosenPa = studentSso.dosenPA?.profileId === reviewerUserId;
    if (!isDosenPa) {
      const internship = await this.workflowRepo.getActiveInternshipByMahasiswaId(request.studentUserId);
      if (!internship || internship.dosenPembimbingId !== reviewerUserId) {
         throw this.createServiceError('Only the assigned Dosen PA/Pembimbing can approve this request', 'FORBIDDEN_REVIEWER', 403);
      }
    }

    const internship = await this.workflowRepo.getActiveInternshipByMahasiswaId(request.studentUserId);
    if (!internship) throw this.createServiceError('No active internship found for this student', 'INTERNSHIP_NOT_FOUND', 404);

    // 2. Call SSO to create mentor
    const ssoMentor = await this.createSsoMentor({
      fullName: request.mentorName,
      instansi: request.companyName || 'Instansi Terkait',
      email: request.mentorEmail,
      noTelepon: request.mentorPhone || undefined,
      jabatan: request.position || undefined,
    });

    const mentorProfileId = ssoMentor.profileId || ssoMentor.profile.id;
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

  async getDosenLogbookMonitor() {
    return this.workflowRepo.listDosenLogbookMonitor();
  }

  async getDosenLogbookMonitorByStudent(studentUserId: string) {
    return this.workflowRepo.listDosenLogbookMonitorByStudent(studentUserId);
  }
}
