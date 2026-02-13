import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '@/errors';
import { ErrorMessages, SuccessMessages } from '@/constants';
import { ResponseLetterRepository } from '@/repositories/response-letter.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { StorageService } from './storage.service';
import type { ResponseLetter, ResponseLetterWithDetails } from '@/types';
import { generateId } from '@/utils/helpers';

/**
 * Response Letter Service
 * Handles business logic for response letter operations
 */
export class ResponseLetterService {
  constructor(
    private responseLetterRepo: ResponseLetterRepository,
    private submissionRepo: SubmissionRepository,
    private storageService: StorageService
  ) {}

  /**
   * Submit a new response letter
   */
  async submitResponseLetter(
    submissionId: string,
    userId: string,
    file: File | { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }
  ): Promise<ResponseLetter> {
    // Validate submission exists
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new NotFoundError(ErrorMessages.SUBMISSION_NOT_FOUND);
    }

    const teamId = submission.teamId;

    // Validate user is member of team
    const isMember = await this.responseLetterRepo.isUserMemberOfTeam(userId, teamId);
    if (!isMember) {
      throw new ForbiddenError('Anda bukan anggota tim ini');
    }

    // Check if response letter already exists
    const existing = await this.responseLetterRepo.findBySubmissionId(submissionId);
    if (existing) {
      throw new ConflictError('Surat balasan sudah pernah disubmit untuk submission ini');
    }

    // Validate file type (PDF only)
    if (!file.type.includes('pdf')) {
      throw new BadRequestError('Hanya file PDF yang diperbolehkan');
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestError('Ukuran file melebihi batas maksimal (10MB)');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = generateId().substring(0, 8);
    const fileName = `response-letter-${submissionId}-${randomString}-${timestamp}.pdf`;

    // Determine folder path with month-based organization
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const folderPath = `response-letters/${year}-${month}`;

    // Upload file to storage
    const fileBuffer = await file.arrayBuffer();
    const uploadResult = await this.storageService.uploadFile(
      Buffer.from(fileBuffer),
      fileName,
      file.type
    );

    // Create response letter record - initially set to 'approved' status
    const responseLetter = await this.responseLetterRepo.create({
      submissionId,
      letterStatus: 'approved', // Default to approved when submitted
      originalName: file.name,
      fileName: fileName,
      fileType: file.type,
      fileSize: file.size,
      fileUrl: uploadResult.url,
      memberUserId: userId,
    });

    // Update submission status
    await this.submissionRepo.updateResponseLetterStatus(submissionId, 'submitted');

    return responseLetter;
  }

  /**
   * Get all response letters for admin
   */
  async getAllResponseLetters(filters?: {
    status?: 'all' | 'approved' | 'rejected' | 'verified' | 'unverified';
    sort?: 'date' | 'name';
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const responseLetters = await this.responseLetterRepo.findAll(filters);
    return responseLetters.map((letter) => this.mapToStudentObject(letter));
  }

  /**
   * Get response letter by ID with details
   */
  async getResponseLetterById(
    id: string,
    userId: string,
    userRole: string
  ): Promise<ResponseLetterWithDetails> {
    const responseLetter = await this.responseLetterRepo.findByIdWithDetails(id);

    if (!responseLetter) {
      throw new NotFoundError(ErrorMessages.RESPONSE_LETTER_NOT_FOUND);
    }

    // Authorization check
    if (userRole === 'MAHASISWA') {
      const submission = await this.submissionRepo.findById(responseLetter.submissionId);
      if (!submission) {
        throw new NotFoundError(ErrorMessages.SUBMISSION_NOT_FOUND);
      }
      const isMember = await this.responseLetterRepo.isUserMemberOfTeam(
        userId,
        submission.teamId
      );
      if (!isMember) {
        throw new ForbiddenError(ErrorMessages.FORBIDDEN);
      }
    }

    return responseLetter;
  }

  /**
   * Get my response letter (current user)
   */
  async getMyResponseLetter(userId: string): Promise<ResponseLetter | null> {
    const responseLetter = await this.responseLetterRepo.findByUserId(userId);
    return responseLetter;
  }

  /**
   * Verify response letter (Admin only)
   */
  async verifyResponseLetter(
    id: string,
    adminId: string,
    letterStatus: 'approved' | 'rejected'
  ): Promise<ResponseLetter> {
    const responseLetter = await this.responseLetterRepo.findById(id);

    if (!responseLetter) {
      throw new NotFoundError(ErrorMessages.RESPONSE_LETTER_NOT_FOUND);
    }

    if (responseLetter.verified) {
      throw new BadRequestError(ErrorMessages.RESPONSE_LETTER_ALREADY_VERIFIED);
    }

    // Verify response letter
    const verified = await this.responseLetterRepo.verify(id, adminId);
    
    // Update the letterStatus based on admin decision
    await this.responseLetterRepo.update(id, { letterStatus });

    // Update submission status to verified
    await this.submissionRepo.updateResponseLetterStatus(
      responseLetter.submissionId,
      'verified'
    );

    return verified;
  }

  /**
   * Delete response letter (Admin only)
   */
  async deleteResponseLetter(id: string): Promise<void> {
    const responseLetter = await this.responseLetterRepo.findById(id);

    if (!responseLetter) {
      throw new NotFoundError(ErrorMessages.RESPONSE_LETTER_NOT_FOUND);
    }

    // Delete file from storage if exists
    if (responseLetter.fileUrl) {
      try {
        // Extract the filename from URL and construct the path
        const urlParts = responseLetter.fileUrl.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const filePath = `response-letters/${year}-${month}/${fileName}`;
        await this.storageService.deleteFile(filePath);
      } catch (error) {
        console.error('Failed to delete file from storage:', error);
        // Continue with deletion even if file deletion fails
      }
    }

    // Delete response letter record
    await this.responseLetterRepo.delete(id);

    // Update submission status back to pending
    await this.submissionRepo.updateResponseLetterStatus(
      responseLetter.submissionId,
      'pending'
    );
  }

  /**
   * Map response letter to frontend Student object
   */
  mapToStudentObject(responseLetter: ResponseLetterWithDetails): any {
    const leader = responseLetter.leader;
    const leaderMahasiswa = leader?.mahasiswaProfile;
    const submission = responseLetter.submission;

    return {
      id: responseLetter.id,
      name: leader?.nama || 'Unknown',
      nim: leaderMahasiswa?.nim || 'Unknown',
      tanggal: responseLetter.submittedAt.toISOString().split('T')[0],
      company: submission?.companyName || 'Unknown',
      role: 'Tim',
      memberCount: responseLetter.members?.length || 0,
      status: responseLetter.letterStatus === 'approved' ? 'Disetujui' : 'Ditolak',
      adminApproved: responseLetter.verified,
      supervisor: 'Dr. Ahmad Santoso, M.Kom', // TODO: Get from submission
      members: responseLetter.members?.map((member) => ({
        id: parseInt(member.id) || 0,
        name: member.nama || 'Unknown',
        nim: member.mahasiswaProfile?.nim || 'Unknown',
        prodi: member.mahasiswaProfile?.prodi || 'Unknown',
        role: 'Anggota',
      })) || [],
      responseFileUrl: responseLetter.fileUrl || null,
    };
  }
}
