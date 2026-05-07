import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '@/errors';
import { ErrorMessages, SuccessMessages } from '@/constants';
import { ResponseLetterRepository } from '@/repositories/response-letter.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { StorageService } from './storage.service';
import { TeamResetService } from './team-reset.service';
import { LetterService } from './letter.service';
import { MahasiswaService } from './mahasiswa.service';
import { DosenService } from './dosen.service';
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
  private teamRepo: TeamRepository;
  private storageService: StorageService;
  private teamResetService: TeamResetService;
  private letterService: LetterService;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.responseLetterRepo = new ResponseLetterRepository(db);
    this.submissionRepo = new SubmissionRepository(db);
    this.teamRepo = new TeamRepository(db);
    this.storageService = new StorageService(env);
    this.teamResetService = new TeamResetService(env);
    this.letterService = new LetterService(env);
    this.mahasiswaService = new MahasiswaService(env);
    this.dosenService = new DosenService(env);
  }

  /**
   * Submit a new response letter
   */
  async submitResponseLetter(
    submissionId: string,
    userId: string,
    file: File | { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
    letterStatus: 'approved' | 'rejected' = 'approved',
    sessionId: string = ''
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
      snapshot = await this.buildSnapshot(submissionId, sessionId);
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
   * Get response letter by submission ID (for team dashboard)
   */
  async getResponseLetterBySubmissionId(submissionId: string, mahasiswaId: string, role: string, sessionId?: string) {
    // 1. Get the response letter record
    const responseLetter = await this.responseLetterRepo.findBySubmissionId(submissionId);
    if (!responseLetter) return null;

    // 2. Authorization check (only team members or admin)
    if (role !== 'admin') {
      const team = await this.submissionRepo.getTeamBySubmissionId(submissionId);
      if (!team) throw new ForbiddenError('Team not found for this submission');
      
      const members = await this.submissionRepo.getTeamMembers(team.id);
      const isMember = members.some(m => m.mahasiswaId === mahasiswaId) || team.leaderMahasiswaId === mahasiswaId;
      
      if (!isMember) {
        throw new ForbiddenError('You are not authorized to view this response letter');
      }
    }

    // 3. Enrich with file URLs
    const fileUrl = this.storageService.getAssetProxyUrl(responseLetter.fileUrl);
    let finalSignedFileUrl = null;

    // If verified and approved, provide the final signed letter URL if it exists
    if (responseLetter.verified && responseLetter.letterStatus === 'approved') {
      const submission = await this.submissionRepo.findById(submissionId);
      if (submission?.finalSignedFileKey) {
        finalSignedFileUrl = this.storageService.getAssetProxyUrl(submission.finalSignedFileKey);
      }
    }

    return {
      ...responseLetter,
      fileUrl,
      finalSignedFileUrl,
    };
  }

  /**
   * Get all response letters for admin
   */
  async getAllResponseLetters(filters?: {
    status?: 'all' | 'approved' | 'rejected' | 'verified' | 'unverified';
    sort?: 'date' | 'name';
    limit?: number;
    offset?: number;
  }, sessionId: string = ''): Promise<unknown[]> {
    const responseLetters = await this.responseLetterRepo.findAll(filters);
    return await Promise.all(responseLetters.map((letter) => this.mapToStudentObject(letter, sessionId)));
  }

  /**
   * Get response letter by ID with details
   */
  async getResponseLetterById(
    id: string,
    userId: string,
    userRole: string,
    sessionId: string = ''
  ): Promise<ResponseLetterWithDetails & { finalSignedFileUrl?: string | null }> {
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

      // Add final signed URL if available
      if (responseLetter.verified && responseLetter.letterStatus === 'approved' && submission.finalSignedFileUrl) {
        return {
          ...(await this.enrichResponseLetterDetails(responseLetter, sessionId)),
          finalSignedFileUrl: submission.finalSignedFileUrl,
        };
      }

      return await this.enrichResponseLetterDetails(responseLetter, sessionId);
    }

    // For admin/other roles, also add final signed URL if available
    if (responseLetter.submissionId) {
      const submission = await this.submissionRepo.findById(responseLetter.submissionId);
      if (submission?.finalSignedFileUrl) {
        return {
          ...(await this.enrichResponseLetterDetails(responseLetter, sessionId)),
          finalSignedFileUrl: submission.finalSignedFileUrl,
        };
      }
    }

    return await this.enrichResponseLetterDetails(responseLetter, sessionId);
  }

  /**
   * Get my response letter (current user)
   * Retrieves response letter for the user's team
   * Returns null if user has no team or team has no submission/response letter
   */
  async getMyResponseLetter(userId: string, sessionId: string = ''): Promise<(ResponseLetterWithDetails & { isLeader: boolean; finalSignedFileUrl?: string | null }) | null> {
    const responseLetter = await this.responseLetterRepo.findByUserTeamWithDetails(userId);
    
    if (!responseLetter || !responseLetter.submissionId) {
      return responseLetter;
    }

    // Add final signed URL if available
    const submission = await this.submissionRepo.findById(responseLetter.submissionId);
    if (submission?.finalSignedFileUrl && responseLetter.verified && responseLetter.letterStatus === 'approved') {
      return {
        ...(await this.enrichResponseLetterDetails(responseLetter, sessionId)),
        finalSignedFileUrl: submission.finalSignedFileUrl,
      };
    }

    return await this.enrichResponseLetterDetails(responseLetter, sessionId);
  }

  /**
   * Verify response letter (Admin only)
    * Note: Team reset is NOT automatic when rejected.
    * Student must explicitly click "Mulai Ulang" to trigger reset.
   */
  async verifyResponseLetter(
    id: string,
    adminId: string,
    letterStatus: 'approved' | 'rejected',
    sessionId: string
  ): Promise<{ responseLetter: ResponseLetter; resetTeam: boolean }> {
    const responseLetter = await this.responseLetterRepo.findById(id);

    if (!responseLetter) {
      throw new NotFoundError(ErrorMessages.RESPONSE_LETTER_NOT_FOUND);
    }

    if (responseLetter.verified) {
      throw new BadRequestError(ErrorMessages.RESPONSE_LETTER_ALREADY_VERIFIED);
    }

    if (this.needsSnapshotRefresh(responseLetter) && responseLetter.submissionId) {
      const snapshot = await this.buildSnapshot(responseLetter.submissionId, sessionId);
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
      // 1. Update the response letter status in the submission
      if (responseLetter.submissionId) {
        await this.submissionRepo.updateResponseLetterStatus(
          responseLetter.submissionId,
          'verified'
        );

        // 2. AUTOMATION: Approve the whole submission and move to COMPLETED
        await this.submissionRepo.update(responseLetter.submissionId, {
          status: 'APPROVED',
          workflowStage: 'COMPLETED',
          approvedAt: new Date(),
        });

        // 3. AUTOMATION: Create Internship Records for the whole team
        try {
          await this.createInternshipRecords(responseLetter.submissionId);
          console.log('[ResponseLetterService] Internship records created automatically for submission', responseLetter.submissionId);
        } catch (error) {
          console.error('[ResponseLetterService] Failed to create internship records:', error);
        }

        // 4. Automatically generate the final signed letter with wakil dekan e-signature
        try {
          await this.letterService.generateFinalSignedLetter(responseLetter.submissionId, adminId, sessionId);
          console.log('[ResponseLetterService] Final signed letter generated automatically');
        } catch (error) {
          console.error('[ResponseLetterService] Failed to generate final signed letter:', error);
        }
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
  async mapToStudentObject(responseLetter: ResponseLetterWithDetails, sessionId: string = ''): Promise<unknown> {
    const leader = responseLetter.leader;
    const leaderMahasiswa = leader?.mahasiswaProfile;
    const submission = responseLetter.submission;
    const team = responseLetter.team;
    const resolved = await this.resolveMembersForResponseLetter(responseLetter, sessionId);
    const supervisorName = await this.resolveSupervisorName(
      responseLetter.supervisorName || team?.dosenKpName || null,
      team?.dosenKpId || null,
      sessionId
    );
    const snapshotMembers = responseLetter.membersSnapshot || [];
    const resolvedMembers = resolved.length > 0
      ? resolved
      : snapshotMembers.map((member, index) => ({
          id: Number.isFinite(Number(member.id)) ? Number(member.id) : index + 1,
          name: member.name || 'Unknown',
          nim: member.nim || 'Unknown',
          prodi: member.prodi || leaderMahasiswa?.prodi || 'Unknown',
          role: member.role || 'Anggota',
        }));

    const leaderMember = resolvedMembers.find((member) => String(member.role).toUpperCase() === 'KETUA' || String(member.role).toUpperCase() === 'KETUA TIM') || resolvedMembers[0];
    const effectiveStudentName = this.pickNonEmpty(
      responseLetter.studentName,
      leaderMember?.name,
      leader?.nama,
      'Unknown'
    );
    const effectiveStudentNim = this.pickNonEmpty(
      responseLetter.studentNim,
      leaderMember?.nim,
      leaderMahasiswa?.nim,
      'Unknown'
    );
    const effectiveProdi = this.pickNonEmpty(
      leaderMember?.prodi,
      leaderMahasiswa?.prodi,
      resolvedMembers[0]?.prodi,
      'Unknown'
    );

    const memberCount = responseLetter.memberCount ?? resolvedMembers.length;
    const roleLabel = responseLetter.roleLabel
      ? responseLetter.roleLabel
      : memberCount > 1
        ? 'Tim'
        : 'Individu';

    return {
      id: responseLetter.id,
      name: effectiveStudentName,
      nim: effectiveStudentNim,
      prodi: effectiveProdi,
      tanggal: responseLetter.submittedAt.toISOString().split('T')[0],
      company: responseLetter.companyName || submission?.companyName || 'Unknown',
      role: roleLabel,
      memberCount: memberCount,
      status: responseLetter.letterStatus === 'approved' ? 'Disetujui' : 'Ditolak',
      adminApproved: responseLetter.verified,
      supervisor: supervisorName,
      members: resolvedMembers,
      responseFileUrl: responseLetter.fileUrl || null,
      ...(responseLetter.verified && responseLetter.letterStatus === 'approved' && submission?.finalSignedFileUrl
        ? { finalSignedFileUrl: submission.finalSignedFileUrl }
        : {}),
    };
  }

  private needsSnapshotRefresh(responseLetter: ResponseLetter): boolean {
    const isUnknown = (value: string | null | undefined) => {
      if (!value) return true;
      const normalized = value.trim().toLowerCase();
      return normalized.length === 0 || normalized === 'unknown' || normalized === 'belum ditentukan';
    };

    return isUnknown(responseLetter.studentName) ||
      isUnknown(responseLetter.studentNim) ||
      !responseLetter.companyName ||
      (!responseLetter.membersSnapshot || responseLetter.membersSnapshot.length === 0);
  }

  private async buildSnapshot(submissionId: string, sessionId: string = ''): Promise<{
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
      const teamId = submission.teamId || submission.team?.id;
      if (!teamId) return null;

      const team = submission.team || await this.teamRepo.findById(teamId);
      const teamMembers = await this.teamRepo.findMembersByTeamId(teamId);
      console.log(`[buildSnapshot] Found ${teamMembers.length} team members`);

      if (teamMembers.length === 0) {
        const supervisorName = await this.resolveSupervisorName(
          (team as { dosenKpName?: string | null } | null)?.dosenKpName || null,
          team?.dosenKpId || null,
          sessionId
        );
        return {
          studentName: 'Unknown',
          studentNim: 'Unknown',
          studentProdi: null,
          companyName: submission.companyName || 'Unknown',
          supervisorName,
          memberCount: 0,
          roleLabel: 'Individu',
          membersSnapshot: [],
        };
      }

      const acceptedMembers = teamMembers.filter((member) => member.invitationStatus === 'ACCEPTED');
      const effectiveMembers = acceptedMembers.length > 0 ? acceptedMembers : teamMembers;

      const memberProfiles = await Promise.all(
        effectiveMembers.map(async (member, index) => {
          const mahasiswa = await this.mahasiswaService.getMahasiswaById(member.mahasiswaId, sessionId);
          return {
            id: index + 1,
            name: mahasiswa?.profile?.fullName || member.mahasiswaId,
            nim: mahasiswa?.nim || 'Unknown',
            prodi: mahasiswa?.prodi?.nama || 'Unknown',
            role: member.role === 'KETUA' ? 'Ketua' : 'Anggota',
          };
        })
      );

      const leaderMember = memberProfiles.find((member) => member.role === 'Ketua') || memberProfiles[0];

      console.log(`[buildSnapshot] Leader: ${leaderMember?.name || 'Unknown'}`);
      console.log(`[buildSnapshot] Effective members: ${memberProfiles.length}`);

      const membersSnapshot = memberProfiles;

      const memberCount = membersSnapshot.length;
      const supervisorName = await this.resolveSupervisorName(
        (team as { dosenKpName?: string | null } | null)?.dosenKpName || null,
        team?.dosenKpId || null,
        sessionId
      );

      const snapshot = {
        studentName: leaderMember?.name || 'Unknown',
        studentNim: leaderMember?.nim || 'Unknown',
        studentProdi: leaderMember?.prodi || null,
        companyName: submission.companyName || 'Unknown',
        supervisorName,
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

  private pickNonEmpty(...values: Array<string | null | undefined>): string {
    for (const value of values) {
      if (!value) continue;
      const normalized = value.trim();
      if (!normalized) continue;
      if (normalized.toLowerCase() === 'unknown') continue;
      return normalized;
    }
    return values[values.length - 1] || '-';
  }

  private isUuidLike(value: string): boolean {
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.trim());
  }

  private async resolveSupervisorName(
    supervisorName: string | null | undefined,
    dosenKpId: string | null | undefined,
    sessionId: string
  ): Promise<string | null> {
    const normalized = supervisorName?.trim() || '';
    const lookupId = dosenKpId || (normalized && this.isUuidLike(normalized) ? normalized : null);

    if (lookupId) {
      const dosen = await this.dosenService.getDosenById(lookupId, sessionId);
      if (dosen?.profile?.fullName) return dosen.profile.fullName;
    }

    if (!normalized || normalized.toLowerCase() === 'unknown') return null;
    return normalized;
  }

  private async resolveMembersForResponseLetter(
    responseLetter: ResponseLetterWithDetails,
    sessionId: string
  ): Promise<Array<{ id: number; name: string; nim: string; prodi: string; role: string }>> {
    const teamId = responseLetter.team?.id || null;
    const snapshotById = new Map((responseLetter.membersSnapshot || []).map((m) => [String(m.id), m]));

    let rows = teamId ? await this.teamRepo.findMembersByTeamId(teamId) : [];
    if (rows.length === 0 && Array.isArray(responseLetter.members) && responseLetter.members.length > 0) {
      rows = responseLetter.members.map((member) => ({
        id: String(member.id || member.mahasiswaId || ''),
        teamId: teamId || '',
        mahasiswaId: String(member.mahasiswaId || member.id || ''),
        role: String(member.role || 'ANGGOTA'),
        invitationStatus: String(member.invitationStatus || 'ACCEPTED') as 'PENDING' | 'ACCEPTED' | 'REJECTED',
        invitedAt: new Date(),
        respondedAt: null,
        invitedByMahasiswaId: null,
      }));
    }

    if (rows.length === 0) {
      return (responseLetter.membersSnapshot || []).map((member, index) => ({
        id: Number(index + 1),
        name: member.name || 'Unknown',
        nim: member.nim || 'Unknown',
        prodi: member.prodi || 'Unknown',
        role: member.role || 'Anggota',
      }));
    }

    const acceptedRows = rows.filter((member) => member.invitationStatus === 'ACCEPTED');
    const effectiveRows = acceptedRows.length > 0 ? acceptedRows : rows;

    const members = await Promise.all(
      effectiveRows.map(async (member, index) => {
        const mahasiswa = await this.mahasiswaService.getMahasiswaById(member.mahasiswaId, sessionId);
        const snapshot = snapshotById.get(member.mahasiswaId) || snapshotById.get(String(index + 1));
        return {
          id: index + 1,
          name: this.pickNonEmpty(mahasiswa?.profile?.fullName, snapshot?.name, member.mahasiswaId),
          nim: this.pickNonEmpty(mahasiswa?.nim, snapshot?.nim, 'Unknown'),
          prodi: this.pickNonEmpty(mahasiswa?.prodi?.nama, snapshot?.prodi, 'Unknown'),
          role: String(member.role || '').toUpperCase() === 'KETUA' ? 'Ketua' : 'Anggota',
        };
      })
    );

    return members.sort((a, b) => {
      if (a.role === 'Ketua') return -1;
      if (b.role === 'Ketua') return 1;
      return 0;
    });
  }

  private async enrichResponseLetterDetails<T extends ResponseLetterWithDetails>(
    responseLetter: T,
    sessionId: string
  ): Promise<T> {
    const resolvedMembers = await this.resolveMembersForResponseLetter(responseLetter, sessionId);
    const leaderMember = resolvedMembers.find((member) => member.role === 'Ketua') || resolvedMembers[0];
    const supervisorName = await this.resolveSupervisorName(
      responseLetter.supervisorName || responseLetter.team?.dosenKpName || null,
      responseLetter.team?.dosenKpId || null,
      sessionId
    );

    const enrichedMembers = resolvedMembers.map((member, index) => ({
      id: String(index + 1),
      mahasiswaId: member.id,
      nama: member.name,
      email: '',
      password: '',
      phone: null,
      role: member.role === 'Ketua' ? 'KETUA' : 'ANGGOTA',
      invitationStatus: 'ACCEPTED',
      isActive: true,
      mahasiswaProfile: {
        nim: member.nim,
        prodi: member.prodi,
      },
    }));

    const updatedSnapshot = resolvedMembers.map((member, index) => ({
      id: index + 1,
      name: member.name,
      nim: member.nim,
      prodi: member.prodi,
      role: member.role,
    }));

    return {
      ...responseLetter,
      studentName: this.pickNonEmpty(responseLetter.studentName, leaderMember?.name, 'Unknown'),
      studentNim: this.pickNonEmpty(responseLetter.studentNim, leaderMember?.nim, 'Unknown'),
      supervisorName: supervisorName || responseLetter.supervisorName,
      memberCount: responseLetter.memberCount ?? resolvedMembers.length,
      membersSnapshot: updatedSnapshot,
      team: responseLetter.team
        ? {
            ...responseLetter.team,
            dosenKpName: supervisorName || responseLetter.team.dosenKpName || null,
          }
        : responseLetter.team,
      members: enrichedMembers,
    };
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

  /**
   * Automatically create internship records for all team members
   */
  private async createInternshipRecords(submissionId: string) {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) return;

    const team = await this.submissionRepo.getTeamBySubmissionId(submissionId);
    if (!team) return;

    const members = await this.submissionRepo.getTeamMembers(team.id);
    
    // If no members (unexpected), at least create for the leader
    const targetMahasiswaIds = members.length > 0 
      ? members.map(m => m.mahasiswaId)
      : [team.leaderMahasiswaId];

    for (const mahasiswaId of targetMahasiswaIds) {
      // Check if internship already exists to avoid duplicates
      const existing = await this.submissionRepo.getInternshipBySubmissionAndMahasiswa(submissionId, mahasiswaId);
      if (existing) continue;

      await this.submissionRepo.createInternship({
        id: generateId(),
        submissionId,
        mahasiswaId,
        teamId: team.id,
        companyName: submission.companyName,
        division: submission.division,
        startDate: submission.startDate,
        endDate: submission.endDate,
        status: 'AKTIF',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
}
