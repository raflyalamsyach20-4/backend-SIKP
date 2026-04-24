import { hash } from 'bcryptjs';
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
    const mahasiswa = await this.workflowRepo.getMahasiswaByUserId(studentUserId);
    if (!mahasiswa) {
      throw new Error('Mahasiswa profile not found');
    }

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

  async approveMentorApprovalRequest(requestId: string, reviewerUserId: string) {
    const request = await this.workflowRepo.getMentorApprovalRequestById(requestId);
    if (!request) throw new Error('Mentor approval request not found');
    if (request.status !== 'PENDING') throw new Error('Only pending requests can be approved');

    const mahasiswa = await this.workflowRepo.getMahasiswaByUserId(request.studentUserId);
    if (!mahasiswa || !mahasiswa.nim) throw new Error('Mahasiswa profile or NIM not found');

    const internship = await this.workflowRepo.getActiveInternshipByMahasiswaNim(mahasiswa.nim);
    if (!internship) throw new Error('No active internship found for this student');

    const email = request.mentorEmail.toLowerCase();
    let mentorUser = await this.workflowRepo.findUserByEmail(email);

    if (!mentorUser) {
      mentorUser = await this.workflowRepo.createMentorUser({
        id: generateId(),
        nama: request.mentorName,
        email,
        password: 'MENTOR_PENDING_ACTIVATION',
        role: 'PEMBIMBING_LAPANGAN',
        phone: request.mentorPhone,
        isActive: false,
      });
    }

    if (!mentorUser) throw new Error('Failed to create mentor user');
    if (mentorUser.role !== 'PEMBIMBING_LAPANGAN') {
      throw new Error('Requested email already belongs to a non-mentor account');
    }

    const mentorProfile = await this.workflowRepo.findMentorProfileById(mentorUser.id);
    if (!mentorProfile) {
      await this.workflowRepo.createMentorProfile({
        id: mentorUser.id,
        companyName: request.companyName,
        position: request.position,
        companyAddress: request.companyAddress,
      });
    } else {
      await this.workflowRepo.updateMentorProfile(mentorUser.id, {
        companyName: request.companyName,
        position: request.position,
        companyAddress: request.companyAddress,
      });
    }

    await this.workflowRepo.assignMentorToInternship(internship.id, mentorUser.id);

    const token = `mnt_${generateId()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.workflowRepo.createActivationToken({
      id: generateId(),
      mentorId: mentorUser.id,
      token,
      expiresAt,
      createdAt: new Date(),
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
      details: { mentorUserId: mentorUser.id, internshipId: internship.id },
      createdAt: new Date(),
    });

    return {
      request: updatedRequest,
      mentor: {
        id: mentorUser.id,
        email: mentorUser.email,
        nama: mentorUser.nama,
      },
      activation: {
        token,
        expiresAt,
        activationLink: `/api/auth/mentor/activate?token=${encodeURIComponent(token)}`,
      },
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
    const mentor = await this.workflowRepo.findUserById(mentorId);
    if (!mentor || mentor.role !== 'PEMBIMBING_LAPANGAN') {
      throw new Error('Mentor account not found');
    }

    if (mentor.email.toLowerCase() === requestedEmail.toLowerCase()) {
      throw new Error('Requested email must be different from current email');
    }

    const req = await this.workflowRepo.createMentorEmailChangeRequest({
      id: generateId(),
      mentorId,
      currentEmail: mentor.email,
      requestedEmail: requestedEmail.toLowerCase(),
      reason: reason ?? null,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: mentorId,
      action: 'CREATE_MENTOR_EMAIL_CHANGE_REQUEST',
      entityType: 'mentor_email_change_requests',
      entityId: req!.id,
      details: { currentEmail: mentor.email, requestedEmail },
      createdAt: new Date(),
    });

    return req;
  }

  async listMentorEmailChangeRequests() {
    return this.workflowRepo.listMentorEmailChangeRequests();
  }

  async approveMentorEmailChangeRequest(requestId: string, reviewerUserId: string) {
    const req = await this.workflowRepo.getMentorEmailChangeRequestById(requestId);
    if (!req) throw new Error('Email change request not found');
    if (req.status !== 'PENDING') throw new Error('Only pending requests can be approved');

    const existingByEmail = await this.workflowRepo.findUserByEmail(req.requestedEmail.toLowerCase());
    if (existingByEmail && existingByEmail.id !== req.mentorId) {
      throw new Error('Requested email is already in use');
    }

    await this.workflowRepo.updateUser(req.mentorId, { email: req.requestedEmail.toLowerCase() });
    const updatedReq = await this.workflowRepo.updateMentorEmailChangeRequest(requestId, {
      status: 'APPROVED',
      reviewedBy: reviewerUserId,
      reviewedAt: new Date(),
      rejectionReason: null,
    });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: reviewerUserId,
      action: 'APPROVE_MENTOR_EMAIL_CHANGE_REQUEST',
      entityType: 'mentor_email_change_requests',
      entityId: requestId,
      details: { mentorId: req.mentorId, newEmail: req.requestedEmail },
      createdAt: new Date(),
    });

    return updatedReq;
  }

  async rejectMentorEmailChangeRequest(requestId: string, reviewerUserId: string, reason: string) {
    const req = await this.workflowRepo.getMentorEmailChangeRequestById(requestId);
    if (!req) throw new Error('Email change request not found');
    if (req.status !== 'PENDING') throw new Error('Only pending requests can be rejected');

    const updatedReq = await this.workflowRepo.updateMentorEmailChangeRequest(requestId, {
      status: 'REJECTED',
      reviewedBy: reviewerUserId,
      reviewedAt: new Date(),
      rejectionReason: reason,
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

    return updatedReq;
  }

  async inviteMentorByEmail(email: string, actorUserId: string) {
    const mentor = await this.workflowRepo.findUserByEmail(email.toLowerCase());
    if (!mentor || mentor.role !== 'PEMBIMBING_LAPANGAN') {
      throw new Error('Mentor account not found');
    }

    const token = `mnt_${generateId()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.workflowRepo.createActivationToken({
      id: generateId(),
      mentorId: mentor.id,
      token,
      expiresAt,
      createdAt: new Date(),
    });

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId,
      action: 'INVITE_MENTOR',
      entityType: 'mentor_activation_tokens',
      entityId: token,
      details: { mentorId: mentor.id, email: mentor.email },
      createdAt: new Date(),
    });

    return { mentorId: mentor.id, email: mentor.email, token, expiresAt };
  }

  async activateMentor(token: string) {
    const activation = await this.workflowRepo.findActivationTokenByToken(token);
    if (!activation) throw new Error('Invalid activation token');
    if (activation.usedAt) throw new Error('Activation token has already been used');
    if (activation.expiresAt < new Date()) throw new Error('Activation token has expired');

    const mentor = await this.workflowRepo.updateUser(activation.mentorId, { isActive: true });
    return { mentorId: mentor?.id, email: mentor?.email, isActive: mentor?.isActive };
  }

  async setMentorPassword(token: string, newPassword: string) {
    const activation = await this.workflowRepo.findActivationTokenByToken(token);
    if (!activation) throw new Error('Invalid activation token');
    if (activation.usedAt) throw new Error('Activation token has already been used');
    if (activation.expiresAt < new Date()) throw new Error('Activation token has expired');

    const hashed = await hash(newPassword, 10);
    const mentor = await this.workflowRepo.updateUser(activation.mentorId, {
      password: hashed,
      isActive: true,
    });
    await this.workflowRepo.markActivationTokenUsed(token);

    await this.workflowRepo.createAuditLog({
      id: generateId(),
      actorUserId: activation.mentorId,
      action: 'SET_MENTOR_PASSWORD',
      entityType: 'mentor_activation_tokens',
      entityId: activation.id,
      details: { mentorId: activation.mentorId },
      createdAt: new Date(),
    });

    return { mentorId: mentor?.id, email: mentor?.email };
  }

  async getDosenLogbookMonitor() {
    return this.workflowRepo.listDosenLogbookMonitor();
  }

  async getDosenLogbookMonitorByStudent(studentUserId: string) {
    const mahasiswa = await this.workflowRepo.getMahasiswaByUserId(studentUserId);
    if (!mahasiswa) throw new Error('Mahasiswa not found');
    return this.workflowRepo.listDosenLogbookMonitorByStudent(studentUserId);
  }
}
