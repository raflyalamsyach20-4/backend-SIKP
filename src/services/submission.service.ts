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

  async createSubmission(teamId: string, userId: string) {
    // Verify team exists and is FIXED
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (team.status !== 'FIXED') {
      throw new Error('Team must be fixed before creating submission');
    }

    // Verify user is team member
    const member = await this.teamRepo.findMemberByTeamAndUser(teamId, userId);
    if (!member || member.invitationStatus !== 'ACCEPTED') {
      throw new Error('User is not a member of this team');
    }

    // Create draft submission
    const submission = await this.submissionRepo.create({
      id: generateId(),
      teamId,
      companyName: '',
      companyAddress: '',
      status: 'DRAFT',
    });

    return submission;
  }

  async updateSubmission(submissionId: string, userId: string, data: {
    companyName?: string;
    companyAddress?: string;
    companyPhone?: string;
    companyEmail?: string;
    companySupervisor?: string;
    position?: string;
    startDate?: Date;
    endDate?: Date;
    description?: string;
  }) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status !== 'DRAFT') {
      throw new Error('Can only update draft submissions');
    }

    // Verify user is team member
    const member = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    if (!member || member.invitationStatus !== 'ACCEPTED') {
      throw new Error('User is not a member of this team');
    }

    return await this.submissionRepo.update(submissionId, data);
  }

  async submitForReview(submissionId: string, userId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status !== 'DRAFT') {
      throw new Error('Submission already submitted');
    }

    // Validate required fields
    if (!submission.companyName || !submission.companyAddress) {
      throw new Error('Company name and address are required');
    }

    // Verify user is team member
    const member = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    if (!member || member.invitationStatus !== 'ACCEPTED') {
      throw new Error('User is not a member of this team');
    }

    return await this.submissionRepo.update(submissionId, { 
      status: 'MENUNGGU',
      submittedAt: new Date()
    });
  }

  async getMySubmissions(userId: string) {
    // Get user's teams
    const teams = await this.teamRepo.findByLeaderId(userId);
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
    userId: string,
    file: File,
    documentType: 'KTP' | 'TRANSKRIP' | 'KRS' | 'PROPOSAL' | 'OTHER'
  ) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new Error('Submission not found');
    }

    // Verify user is team member
    const member = await this.teamRepo.findMemberByTeamAndUser(submission.teamId, userId);
    if (!member || member.invitationStatus !== 'ACCEPTED') {
      throw new Error('User is not a member of this team');
    }

    if (!this.storageService) {
      throw new Error('Storage service not configured');
    }

    // Validate file
    const allowedTypes = ['pdf', 'docx', 'doc'];
    if (!this.storageService.validateFileType(file.name, allowedTypes)) {
      throw new Error('Invalid file type. Only PDF and DOCX are allowed');
    }

    const maxSizeMB = 5;
    if (!this.storageService.validateFileSize(file.size, maxSizeMB)) {
      throw new Error(`File size exceeds ${maxSizeMB}MB limit`);
    }

    // Upload file
    const uniqueFileName = this.storageService.generateUniqueFileName(file.name);
    const { url, key } = await this.storageService.uploadFile(file, uniqueFileName, 'documents');

    // Save to database
    return await this.submissionRepo.addDocument({
      id: generateId(),
      submissionId,
      fileName: key,
      originalName: file.name,
      fileType: file.type,
      fileSize: file.size,
      fileUrl: url,
      documentType,
      uploadedBy: userId,
    });
  }

  async getDocuments(submissionId: string) {
    return await this.submissionRepo.findDocumentsBySubmissionId(submissionId);
  }

  async getSubmissionById(submissionId: string) {
    return await this.submissionRepo.findById(submissionId);
  }
}

