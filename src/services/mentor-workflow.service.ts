import { MentorWorkflowRepository } from '@/repositories/mentor-workflow.repository';
import { generateId } from '@/utils/helpers';

export class MentorWorkflowService {
  constructor(private workflowRepo: MentorWorkflowRepository) {}

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
    if (!request) throw new Error('Mentor approval request not found');
    if (request.status !== 'PENDING') throw new Error('Only pending requests can be approved');

    const internship = await this.workflowRepo.getActiveInternshipByMahasiswaId(request.studentUserId);
    if (!internship) throw new Error('No active internship found for this student');

    // Assign the mentor (using their SSO profileId) to the internship
    await this.workflowRepo.assignMentorToInternship(internship.id, mentorProfileId);

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
    if (!request) throw new Error('Mentor approval request not found');
    if (request.status !== 'PENDING') throw new Error('Only pending requests can be rejected');

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

