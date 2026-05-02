import { createDbClient } from '@/db';
import { MentorWorkflowRepository } from '@/repositories/mentor-workflow.repository';
import { generateId } from '@/utils/helpers';

export class MentorWorkflowService {
  private workflowRepo: MentorWorkflowRepository;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.workflowRepo = new MentorWorkflowRepository(db);
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

  async listMentorApprovalRequests() {
    return this.workflowRepo.listMentorApprovalRequests();
  }

  async approveMentorApprovalRequest(requestId: string, reviewerUserId: string, mentorProfileId: string) {
    const request = await this.workflowRepo.getMentorApprovalRequestById(requestId);
    if (!request) throw this.createServiceError('Mentor approval request not found', 'REQUEST_NOT_FOUND', 404);
    if (request.status !== 'PENDING') throw this.createServiceError('Only pending requests can be approved', 'INVALID_STATUS', 409);

    const internship = await this.workflowRepo.getActiveInternshipByMahasiswaId(request.studentUserId);
    if (!internship) throw this.createServiceError('No active internship found for this student', 'INTERNSHIP_NOT_FOUND', 404);

    // Assign the mentor (using their SSO profileId) to the internship
    await this.workflowRepo.assignMentorToInternship(internship.id, mentorProfileId);

    // Create or update local mentor profile
    await this.workflowRepo.createMentorProfile({
      id: mentorProfileId,
      fullName: request.mentorName,
      email: request.mentorEmail,
      phone: request.mentorPhone,
      companyName: request.companyName,
      position: request.position,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const updatedRequest = await this.workflowRepo.updateMentorApprovalRequest(requestId, {
      status: 'APPROVED',
      reviewedBy: reviewerUserId,
      reviewedAt: new Date(),
      rejectionReason: null,
    });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: reviewerUserId,
      action: 'APPROVE_MENTOR_APPROVAL_REQUEST',
      entityType: 'mentor_approval_requests',
      entityId: requestId,
      details: { mentorProfileId, internshipId: internship.id },
      createdAt: new Date(),
    });

    return {
      request: updatedRequest,
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
      currentEmail: '', // This should be fetched from SSO
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

