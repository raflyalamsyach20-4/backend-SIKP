import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '@/errors';
import { ErrorMessages, SuccessMessages } from '@/constants';
import { ResponseLetterRepository } from '@/repositories/response-letter.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { StorageService } from './storage.service';
import { TeamResetService } from './team-reset.service';
import type { ResponseLetter, ResponseLetterWithDetails } from '@/types';
import { generateId } from '@/utils/helpers';
import { createDbClient } from '@/db';

/**
 * Response Letter Service
 * Handles business logic for response letter operations
 */
export class ResponseLetterService {
  private responseLetterRepo: ResponseLetterRepository;
  private submissionRepo: SubmissionRepository;
  private storageService: StorageService;
  private teamResetService: TeamResetService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.responseLetterRepo = new ResponseLetterRepository(db);
    this.submissionRepo = new SubmissionRepository(db);
    this.storageService = new StorageService(env);
    this.teamResetService = new TeamResetService(env);
  }

  /**
   * Submit a new response letter
   */
  async submitResponseLetter(
    submissionId: string,
    userId: string,
    file: File | { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
    letterStatus: 'approved' | 'rejected' = 'approved'
  ): Promise<ResponseLetter> {
    // Validate submission exists
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) {
      throw new NotFoundError(ErrorMessages.SUBMISSION_NOT_FOUND);
    }

    const teamId = submission.teamId;

    // Validate user is member of team
    const isMember = await this.responseLetterRepo.isMahasiswaMemberOfTeam(userId, teamId);
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
      'response-letters',
      'application/pdf'
    );

    // Build snapshot for history preservation
    let snapshot = null;
    try {
      snapshot = await this.buildSnapshot(submissionId);
      if (!snapshot) {
        console.warn(`[ResponseLetterService] Snapshot is null for submission ${submissionId}`);
      } else {
        console.log(`[ResponseLetterService] Snapshot created: ${snapshot.studentName} (${snapshot.memberCount} members)`);
      }
    } catch (error) {
      console.error(`[ResponseLetterService] Failed to build snapshot for submission ${submissionId}:`, error);
    }

    // Create response letter record - initially set to 'approved' status
    const responseLetter = await this.responseLetterRepo.create({
      submissionId,
      letterStatus,
      originalName: file.name,
      fileName: fileName,
      fileType: file.type,
      fileSize: file.size,
      fileUrl: uploadResult.url,
      memberMahasiswaId: userId,
      studentName: snapshot?.studentName ?? null,
      studentNim: snapshot?.studentNim ?? null,
      companyName: snapshot?.companyName ?? null,
      supervisorName: snapshot?.supervisorName ?? null,
      memberCount: snapshot?.memberCount ?? null,
      roleLabel: snapshot?.roleLabel ?? null,
      membersSnapshot: snapshot?.membersSnapshot ?? null,
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
  }): Promise<unknown[]> {
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
      if (!responseLetter.submissionId) {
        throw new NotFoundError(ErrorMessages.SUBMISSION_NOT_FOUND);
      }

      const submission = await this.submissionRepo.findById(responseLetter.submissionId);
      if (!submission) {
        throw new NotFoundError(ErrorMessages.SUBMISSION_NOT_FOUND);
      }
      const isMember = await this.responseLetterRepo.isMahasiswaMemberOfTeam(
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
   * Retrieves response letter for the user's team
   * Returns null if user has no team or team has no submission/response letter
   */
  async getMyResponseLetter(userId: string): Promise<(ResponseLetterWithDetails & { isLeader: boolean }) | null> {
    const responseLetter = await this.responseLetterRepo.findByUserTeamWithDetails(userId);
    return responseLetter;
  }

  /**
   * Verify response letter (Admin only)
    * Note: Team reset is NOT automatic when rejected.
    * Student must explicitly click "Mulai Ulang" to trigger reset.
   */
  async verifyResponseLetter(
    id: string,
    adminId: string,
    letterStatus: 'approved' | 'rejected'
  ): Promise<{ responseLetter: ResponseLetter; resetTeam: boolean }> {
    const responseLetter = await this.responseLetterRepo.findById(id);

    if (!responseLetter) {
      throw new NotFoundError(ErrorMessages.RESPONSE_LETTER_NOT_FOUND);
    }

    if (responseLetter.verified) {
      throw new BadRequestError(ErrorMessages.RESPONSE_LETTER_ALREADY_VERIFIED);
    }

    if (this.needsSnapshotRefresh(responseLetter) && responseLetter.submissionId) {
      const snapshot = await this.buildSnapshot(responseLetter.submissionId);
      if (snapshot) {
        await this.responseLetterRepo.update(id, {
          studentName: snapshot.studentName,
          studentNim: snapshot.studentNim,
          companyName: snapshot.companyName,
          supervisorName: snapshot.supervisorName,
          memberCount: snapshot.memberCount,
          roleLabel: snapshot.roleLabel,
          membersSnapshot: snapshot.membersSnapshot,
        });
      }
    }

    // Verify response letter
    const verified = await this.responseLetterRepo.verify(id, adminId);
    
    // Update the letterStatus based on admin decision
    await this.responseLetterRepo.update(id, { letterStatus });

    // Reset is now always manual by student action (button "Mulai Ulang").
    const resetTeam = false;

    if (letterStatus === 'approved') {
      // Update submission status to verified only if approved
      if (responseLetter.submissionId) {
        await this.submissionRepo.updateResponseLetterStatus(
          responseLetter.submissionId,
          'verified'
        );
      }
    } else {
      console.log('[ResponseLetterService] Response letter rejected. Waiting for student manual reset action.');
    }

    return {
      responseLetter: verified,
      resetTeam,
    };
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
    if (responseLetter.submissionId) {
      await this.submissionRepo.updateResponseLetterStatus(
        responseLetter.submissionId,
        'pending'
      );
    }
  }

  /**
   * Map response letter to frontend Student object
   */
  mapToStudentObject(responseLetter: ResponseLetterWithDetails): unknown {
    const leader = responseLetter.leader;
    const leaderMahasiswa = leader?.mahasiswaProfile;
    const submission = responseLetter.submission;
    const supervisorName = responseLetter.team?.dosenKpName || null;
    const snapshotMembers = responseLetter.membersSnapshot || [];
    const resolvedMembers = snapshotMembers.length > 0
      ? snapshotMembers.map((member, index) => ({
          id: Number.isFinite(Number(member.id)) ? Number(member.id) : index + 1,
          name: member.name || 'Unknown',
          nim: member.nim || 'Unknown',
          prodi: member.prodi || leaderMahasiswa?.prodi || 'Unknown',
          role: member.role || 'Anggota',
        }))
      : responseLetter.members?.map((member, index) => ({
          id: parseInt(member.id) || index + 1,
          name: member.nama || 'Unknown',
          nim: member.mahasiswaProfile?.nim || 'Unknown',
          prodi: member.mahasiswaProfile?.prodi || 'Unknown',
          role: String(member.role || '').toUpperCase() === 'KETUA' ? 'Ketua' : 'Anggota',
        })) || [];

    const memberCount = responseLetter.memberCount ?? resolvedMembers.length;
    const roleLabel = responseLetter.roleLabel
      ? responseLetter.roleLabel
      : memberCount > 1
        ? 'Tim'
        : 'Individu';

    return {
      id: responseLetter.id,
      name: responseLetter.studentName || leader?.nama || 'Unknown',
      nim: responseLetter.studentNim || leaderMahasiswa?.nim || 'Unknown',
      prodi: leaderMahasiswa?.prodi || resolvedMembers[0]?.prodi || 'Unknown',
      tanggal: responseLetter.submittedAt.toISOString().split('T')[0],
      company: responseLetter.companyName || submission?.companyName || 'Unknown',
      role: roleLabel,
      memberCount: memberCount,
      status: responseLetter.letterStatus === 'approved' ? 'Disetujui' : 'Ditolak',
      adminApproved: responseLetter.verified,
      supervisor: responseLetter.supervisorName || supervisorName,
      members: resolvedMembers,
      responseFileUrl: responseLetter.fileUrl || null,
    };
  }

  private needsSnapshotRefresh(responseLetter: ResponseLetter): boolean {
    return !responseLetter.studentName &&
      !responseLetter.studentNim &&
      !responseLetter.companyName &&
      (!responseLetter.membersSnapshot || responseLetter.membersSnapshot.length === 0);
  }

  private async buildSnapshot(submissionId: string): Promise<{
    studentName: string | null;
    studentNim: string | null;
    studentProdi: string | null;
    companyName: string | null;
    supervisorName: string | null;
    memberCount: number;
    roleLabel: string;
    membersSnapshot: Array<{ id: number; name: string; nim: string; prodi: string; role: string }>;
  } | null> {
    try {
      console.log(`[buildSnapshot] Building snapshot for submission ${submissionId}`);
      
      const submission = await this.submissionRepo.findByIdWithTeam(submissionId);
      
      if (!submission) {
        console.warn(`[buildSnapshot] Submission ${submissionId} not found`);
        return null;
      }
      
      if (!submission.team) {
        console.warn(`[buildSnapshot] Submission ${submissionId} has no team`);
        return null;
      }

      const members = submission.team.members || [];
      console.log(`[buildSnapshot] Found ${members.length} team members`);
      
      if (members.length === 0) {
        console.warn(`[buildSnapshot] No members found for team ${submission.team.id}`);
        // Return minimal snapshot with company info
        return {
          studentName: 'Unknown',
          studentNim: 'Unknown',
          studentProdi: null,
          companyName: submission.companyName || 'Unknown',
          supervisorName: submission.team.dosenKpName || null,
          memberCount: 0,
          roleLabel: 'Individu',
          membersSnapshot: [],
        };
      }
      
      const acceptedMembers = members.filter((member) => member.status === 'ACCEPTED');
      const effectiveMembers = acceptedMembers.length > 0 ? acceptedMembers : members;
      const leaderMember = effectiveMembers.find((member) => member.role === 'KETUA') || effectiveMembers[0];

      console.log(`[buildSnapshot] Leader: ${leaderMember?.user?.name || 'Unknown'}`);
      console.log(`[buildSnapshot] Effective members: ${effectiveMembers.length}`);

      const membersSnapshot = effectiveMembers.map((member, index) => ({
        id: index + 1,
        name: member.user?.name || 'Unknown',
        nim: member.user?.nim || 'Unknown',
        prodi: member.user?.prodi || 'Unknown',
        role: member.role === 'KETUA' ? 'Ketua' : 'Anggota',
      }));

      const memberCount = membersSnapshot.length;

      const snapshot = {
        studentName: leaderMember?.user?.name || 'Unknown',
        studentNim: leaderMember?.user?.nim || 'Unknown',
        studentProdi: leaderMember?.user?.prodi || null,
        companyName: submission.companyName || 'Unknown',
        supervisorName: submission.team.dosenKpName || null,
        memberCount,
        roleLabel: memberCount > 1 ? 'Tim' : 'Individu',
        membersSnapshot,
      };
      
      console.log(`[buildSnapshot] Snapshot created successfully:`, JSON.stringify(snapshot, null, 2));
      return snapshot;
      
    } catch (error) {
      console.error(`[buildSnapshot] Error building snapshot:`, error);
      return null;
    }
  }

  /**
   * Get response letter status (for polling team reset status)
   * Returns whether team was reset after rejection
   */
  async getResponseLetterStatus(
    id: string,
    userId: string,
    userRole: string
  ): Promise<{
    id: string;
    verified: boolean;
    letterStatus: 'approved' | 'rejected';
    teamWasReset: boolean;
    verifiedAt: Date | null;
  }> {
    const responseLetter = await this.responseLetterRepo.findById(id);

    if (!responseLetter) {
      throw new NotFoundError(ErrorMessages.RESPONSE_LETTER_NOT_FOUND);
    }

    // Authorization check for mahasiswa
    if (userRole === 'MAHASISWA') {
      if (!responseLetter.submissionId) {
        return {
          id: responseLetter.id,
          verified: responseLetter.verified,
          letterStatus: responseLetter.letterStatus,
          teamWasReset: true,
          verifiedAt: responseLetter.verifiedAt,
        };
      }

      const submission = await this.submissionRepo.findById(responseLetter.submissionId);
      if (!submission || submission.archivedAt) {
        // If submission doesn't exist or was archived (team reset), return reset flag
        return {
          id: responseLetter.id,
          verified: responseLetter.verified,
          letterStatus: responseLetter.letterStatus,
          teamWasReset: true,
          verifiedAt: responseLetter.verifiedAt,
        };
      }
      
      const isMember = await this.responseLetterRepo.isMahasiswaMemberOfTeam(
        userId,
        submission.teamId
      );
      if (!isMember) {
        throw new ForbiddenError(ErrorMessages.FORBIDDEN);
      }
    }

    // Check if team was reset
    const teamWasReset = responseLetter.submissionId
      ? await this.teamResetService.checkTeamWasReset(responseLetter.submissionId)
      : true;

    return {
      id: responseLetter.id,
      verified: responseLetter.verified,
      letterStatus: responseLetter.letterStatus,
      teamWasReset: teamWasReset && responseLetter.verified && responseLetter.letterStatus === 'rejected',
      verifiedAt: responseLetter.verifiedAt,
    };
  }
}
