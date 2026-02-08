import { SubmissionRepository } from '@/repositories/submission.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { StorageService } from './storage.service';
import { generateId } from '@/utils/helpers';

export class SubmissionService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private teamRepo: TeamRepository,
    private storageService?: StorageService
  ) {}

  async createSubmission(
    teamId: string, 
    userId: string,
    data: {
      letterPurpose: string;
      companyName: string;
      companyAddress: string;
      division: string;
      startDate: string;
      endDate: string;
    }
  ) {
    // Verify team exists and is FIXED
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.status !== 'FIXED') {
      throw new Error('Team must be fixed before creating submission');
    }

    // Verify user is team leader
    if (team.leaderId !== userId) {
      throw new Error('Only team leader can create submission');
    }

    // Create draft submission with all data
    const submission = await this.submissionRepo.create({
      id: generateId(),
      teamId,
      letterPurpose: data.letterPurpose,
      companyName: data.companyName,
      companyAddress: data.companyAddress,
      division: data.division,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'DRAFT',
    });

    return submission;
  }

  async updateSubmission(submissionId: string, userId: string, data: {
    letterPurpose?: string;
    companyName?: string;
    companyAddress?: string;
    division?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Pengajuan tidak ditemukan.');
    }

    if (submission.status !== 'DRAFT') {
      throw new Error('Pengajuan sudah diajukan dan tidak dapat diubah.');
    }

    // Verify user is team leader
    const team = await this.teamRepo.findById(submission.teamId);
    if (!team || team.leaderId !== userId) {
      throw new Error('Hanya ketua tim yang dapat mengubah pengajuan.');
    }

    return await this.submissionRepo.update(submissionId, data);
  }

  async submitForReview(submissionId: string, userId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Pengajuan tidak ditemukan.');
    }

    if (submission.status !== 'DRAFT') {
      throw new Error('Pengajuan sudah diajukan dan tidak dapat diubah.');
    }

    // Verify user is team leader
    const team = await this.teamRepo.findById(submission.teamId);
    if (!team || team.leaderId !== userId) {
      throw new Error('Hanya ketua tim yang dapat mengajukan.');
    }

    // Validate required fields
    if (!submission.letterPurpose || !submission.companyName || !submission.companyAddress || 
        !submission.division || !submission.startDate || !submission.endDate) {
      throw new Error('Semua kolom wajib diisi sebelum mengajukan untuk ditinjau.');
    }

    return await this.submissionRepo.update(submissionId, { 
      status: 'PENDING_REVIEW',
      submittedAt: new Date()
    });
  }

  async getMySubmissions(userId: string) {
    // ✅ Get ALL teams where user is an ACCEPTED member (not just leader)
    const teams = await this.teamRepo.findTeamsByMemberId(userId);
    const teamIds = teams.map(t => t.id);

    // Get submissions for those teams
    const submissions = [];
    for (const teamId of teamIds) {
      const teamSubmissions = await this.submissionRepo.findByTeamId(teamId);
      submissions.push(...teamSubmissions);
    }

    return submissions;
  }

  async uploadDocument(
    submissionId: string, 
    uploadedByUserId: string,
    memberUserId: string,
    file: File,
    documentType: 'PROPOSAL_KETUA' | 'SURAT_KESEDIAAN' | 'FORM_PERMOHONAN' | 'KRS_SEMESTER_4' | 'DAFTAR_KUMPULAN_NILAI' | 'BUKTI_PEMBAYARAN_UKT',
    authUserId: string
  ) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      const notFound: any = new Error('Pengajuan tidak ditemukan.');
      notFound.statusCode = 404;
      throw notFound;
    }

    if (submission.status !== 'DRAFT') {
      throw new Error('Pengajuan sudah diajukan dan tidak dapat diubah.');
    }

    // ✅ Requester must be an ACCEPTED member of the team
    const requesterMembership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, authUserId);
    if (!requesterMembership || requesterMembership.invitationStatus !== 'ACCEPTED') {
      const unauthorized: any = new Error('Unauthorized - not team member');
      unauthorized.statusCode = 403;
      throw unauthorized;
    }

    // Verify member exists in team
    const member = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, memberUserId);
    if (!member || member.invitationStatus !== 'ACCEPTED') {
      const invalidMember: any = new Error('User is not a member of this team');
      invalidMember.statusCode = 403;
      throw invalidMember;
    }

    // ✅ Ensure uploadedByUserId is set (fallback to authenticated user if not provided)
    let finalUploadedByUserId = uploadedByUserId || authUserId;
    if (!finalUploadedByUserId) {
      throw new Error('uploadedByUserId is required');
    }

    // ✅ Uploader must also be an ACCEPTED member of the team
    const uploaderMembership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, finalUploadedByUserId);
    if (!uploaderMembership || uploaderMembership.invitationStatus !== 'ACCEPTED') {
      const unauthorizedUploader: any = new Error('Unauthorized - uploader is not team member');
      unauthorizedUploader.statusCode = 403;
      throw unauthorizedUploader;
    }

    if (!this.storageService) {
      throw new Error('Storage service not configured');
    }

    // Validate file
    const allowedTypes = ['pdf', 'docx', 'doc'];
    if (!this.storageService.validateFileType(file.name, allowedTypes)) {
      throw new Error('Invalid file type. Only PDF and DOCX are allowed');
    }

    const maxSizeMB = 10;
    if (!this.storageService.validateFileSize(file.size, maxSizeMB)) {
      throw new Error(`File size exceeds ${maxSizeMB}MB limit`);
    }

    // Upload file
    const uniqueFileName = this.storageService.generateUniqueFileName(file.name);
    const { url, key } = await this.storageService.uploadFile(file, uniqueFileName, 'documents');

    // ✅ Sanitize fileType: trim MIME type to base type (remove charset and other params)
    let sanitizedFileType = file.type || 'application/octet-stream';
    if (sanitizedFileType.includes(';')) {
      sanitizedFileType = sanitizedFileType.split(';')[0].trim();
    }

    // Save to database - handles unique constraint per member
    return await this.submissionRepo.addDocument({
      id: generateId(),
      submissionId,
      documentType,
      memberUserId,
      uploadedByUserId: finalUploadedByUserId,
      fileName: key,
      originalName: file.name,
      fileType: sanitizedFileType,
      fileSize: file.size,
      fileUrl: url,
    });
  }

  async getDocuments(submissionId: string, userId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      const notFound: any = new Error('Submission not found');
      notFound.statusCode = 404;
      throw notFound;
    }

    const membership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    if (!membership || membership.invitationStatus !== 'ACCEPTED') {
      const unauthorized: any = new Error('Unauthorized - not team member');
      unauthorized.statusCode = 403;
      throw unauthorized;
    }

    return await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
  }

  async getSubmissionById(submissionId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      return null;
    }

    const team = await this.teamRepo.findById(submission.teamId);
    const documents = await this.submissionRepo.findDocumentsBySubmissionId(submissionId);

    let members: Array<{
      id: string;
      user: { id: string; name: string | null; email: string | null; nim: string | null; prodi: string | null };
      role: string;
      status: string;
    }> = [];

    if (team) {
      const teamMembers = await this.teamRepo.findMembersWithUserDataByTeamId(submission.teamId);
      members = teamMembers.map((m) => ({
        id: m.id,
        user: {
          id: m.user.id,
          name: m.user.nama ?? null,
          email: m.user.email ?? null,
          nim: m.user.nim ?? null,
          prodi: m.user.prodi ?? null,
        },
        role: m.role,
        status: m.invitationStatus,
      }));
    }

    return {
      ...submission,
      team: team
        ? {
            ...team,
            members,
          }
        : null,
      documents,
    };
  }

  async approveSubmission(submissionId: string, approvedByUserId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status !== 'PENDING_REVIEW') {
      throw new Error('Only pending submissions can be approved');
    }

    return await this.submissionRepo.update(submissionId, {
      status: 'APPROVED',
      approvedAt: new Date(),
    });
  }

  async rejectSubmission(submissionId: string, approvedByUserId: string, rejectionReason: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status !== 'PENDING_REVIEW') {
      throw new Error('Only pending submissions can be rejected');
    }

    return await this.submissionRepo.update(submissionId, {
      status: 'REJECTED',
      rejectionReason,
      approvedAt: new Date(),
    });
  }

  /**
   * Reset submission from REJECTED to DRAFT
   * Allows team members to resubmit after rejection
   * Appends to statusHistory
   */
  async resetToDraft(submissionId: string, userId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Pengajuan tidak ditemukan.');
    }

    // ✅ Only REJECTED submissions can be reset to DRAFT
    if (submission.status !== 'REJECTED') {
      throw new Error('Hanya pengajuan yang ditolak yang dapat diajukan ulang.');
    }

    // Verify user is team member
    const team = await this.teamRepo.findById(submission.teamId);
    if (!team) {
      throw new Error('Tim tidak ditemukan.');
    }

    // ✅ Check if user is an ACCEPTED member of the team
    const userMembership = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    if (!userMembership || userMembership.invitationStatus !== 'ACCEPTED') {
      throw new Error('Anda tidak authorized untuk mengajukan ulang pengajuan ini.');
    }

    // ✅ Prepare status history entry for DRAFT
    const now = new Date();
    const draftHistoryEntry = {
      status: 'DRAFT',
      date: now.toISOString(),
    };

    // ✅ Append to existing history
    const currentHistory = Array.isArray(submission.statusHistory) ? submission.statusHistory : [];
    const newHistory = [...currentHistory, draftHistoryEntry];

    // Reset submission to DRAFT
    return await this.submissionRepo.update(submissionId, {
      status: 'DRAFT',
      rejectionReason: null,
      statusHistory: newHistory,
    });
  }
}

