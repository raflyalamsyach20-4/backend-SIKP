import { SubmissionRepository } from '@/repositories/submission.repository';
import { TeamRepository } from '@/repositories/team.repository';
import { StorageService } from '@/services/storage.service';
import { MahasiswaService } from '@/services/mahasiswa.service';
import { DosenService } from '@/services/dosen.service';
import type { RbacRole } from '@/types';
import { createDbClient } from '@/db';

type VerifierContext = {
  userId: string; // dosingId
  role: RbacRole;
  nama: string | null;
  nip: string | null;
  jabatan: string | null;
  prodi: string | null;
  esignatureUrl: string | null;
};

type SigningContext = VerifierContext & {
  signatureImageBuffer: Buffer;
  signatureMimeType: string;
};

type VerifierSubmission = {
  id: string;
  teamId: string;
  workflowStage?: string | null;
  adminVerificationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  dosenVerificationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  dosenVerifiedAt?: Date | string | null;
  dosenVerifiedByDosenId?: string | null;
  finalSignedFileUrl?: string | null;
  archivedAt?: Date | string | null;
  status?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  division?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  submittedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  letterPurpose?: string | null;
  letterNumber?: string | null;
  statusHistory?: unknown;
  team?: {
    leaderMahasiswaId?: string | null;
  } | null;
};

export class SuratPengantarDosenService {
  private submissionRepo: SubmissionRepository;
  private teamRepo: TeamRepository;
  private storageService: StorageService;
  
  private _mahasiswaService?: MahasiswaService;
  private _dosenService?: DosenService;

  constructor(
    private env: CloudflareBindings
  ) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.submissionRepo = new SubmissionRepository(db);
    this.teamRepo = new TeamRepository(db);
    this.storageService = new StorageService(this.env);
  }

  private get mahasiswaService(): MahasiswaService {
    if (!this._mahasiswaService) {
      this._mahasiswaService = new MahasiswaService(this.env);
    }
    return this._mahasiswaService;
  }

  private get dosenService(): DosenService {
    if (!this._dosenService) {
      this._dosenService = new DosenService(this.env);
    }
    return this._dosenService;
  }

  async getRequestsForVerifier(dosenId: string, role: RbacRole, sessionId: string) {
    const verifier = await this.resolveVerifierContext(dosenId, role, sessionId);
    const allSubmissions = await this.submissionRepo.findAll();
    const submissions = (allSubmissions as VerifierSubmission[]).filter((submission) => {
      const isPendingQueue = submission.workflowStage === 'PENDING_DOSEN_VERIFICATION';
      const isVerifierHistory =
        (submission.workflowStage === 'COMPLETED' || submission.workflowStage === 'REJECTED_DOSEN') &&
        submission.dosenVerifiedByDosenId === verifier.userId;

      if (submission.archivedAt != null) return isVerifierHistory;
      return isPendingQueue || isVerifierHistory;
    });

    const items: any[] = [];

    for (const submission of submissions) {
      const team = await this.teamRepo.findById(submission.teamId);
      const signedFileUrl = await this.resolveFinalSignedFileUrl(submission);
      
      const isHistoryRow = submission.workflowStage === 'COMPLETED' || submission.workflowStage === 'REJECTED_DOSEN';
      
      // Authorization check
      let allowed = false;
      if (isHistoryRow) {
        allowed = submission.dosenVerifiedByDosenId === verifier.userId;
      } else {
        allowed = await this.canVerifierAccessSubmission(verifier, team?.leaderMahasiswaId, sessionId);
      }

      if (!allowed) continue;

      const student = team?.leaderMahasiswaId 
        ? await this.mahasiswaService.getMahasiswaById(team.leaderMahasiswaId, sessionId)
        : null;

      let team_members: any[] = [];
      let academic_supervisor: string | null = null;

      if (team) {
        if (team.dosenKpId) {
          const dosenKp = await this.dosenService.getDosenById(team.dosenKpId, sessionId);
          if (dosenKp) {
            academic_supervisor = dosenKp.profile.fullName;
          }
        }
        if (!academic_supervisor) {
          academic_supervisor = student?.dosenPA?.profile?.fullName || null;
        }

        const teamMembers = await this.teamRepo.findMembersByTeamId(team.id);
        const acceptedMembers = teamMembers.filter(m => m.invitationStatus === 'ACCEPTED');
        
        for (const member of acceptedMembers) {
          const memberStudent = await this.mahasiswaService.getMahasiswaById(member.mahasiswaId, sessionId);
          if (memberStudent) {
            team_members.push({
              id: memberStudent.id,
              name: memberStudent.profile.fullName,
              nim: memberStudent.nim,
              prodi: memberStudent.prodi?.nama || '-',
              role: member.role
            });
          }
        }
        
        team_members.sort((a, b) => {
          if (a.role === 'KETUA') return -1;
          if (b.role === 'KETUA') return 1;
          return 0;
        });
      }

      items.push({
        id: submission.id,
        teamCode: team?.code ?? 'TEAM_DIBUBARKAN',
        nim: student?.nim ?? 'Unknown',
        namaMahasiswa: student?.profile.fullName ?? 'Unknown',
        status: submission.workflowStage === 'COMPLETED' ? 'DISETUJUI' : submission.workflowStage === 'REJECTED_DOSEN' ? 'DITOLAK' : 'MENUNGGU',
        companyName: submission.companyName,
        signedFileUrl,
        letterNumber: submission.letterNumber,
        academic_supervisor,
        team_members,
        createdAt: submission.createdAt instanceof Date
          ? submission.createdAt.toISOString()
          : submission.createdAt ?? null,
        tanggal: submission.submittedAt instanceof Date
          ? submission.submittedAt.toISOString()
          : submission.submittedAt ?? (submission.createdAt instanceof Date
              ? submission.createdAt.toISOString()
              : submission.createdAt ?? null),
      });
    }

    return items;
  }

  private async resolveVerifierContext(dosenId: string, role: RbacRole, sessionId: string): Promise<VerifierContext> {
    const dosen = await this.dosenService.getDosenById(dosenId, sessionId);
    if (!dosen) throw new Error('Dosen tidak ditemukan di SSO');

    return {
      userId: dosenId,
      role,
      nama: dosen.profile.fullName,
      nip: dosen.profile.authUserId, // Use authUserId as NIP if nip field missing in response
      jabatan: dosen.jabatanFungsional,
      prodi: dosen.prodi?.nama || null,
      esignatureUrl: null, // Fetched differently in new proxy service
    };
  }

  private async canVerifierAccessSubmission(verifier: VerifierContext, leaderMahasiswaId: string | null | undefined, sessionId: string) {
    if (verifier.role === 'wakil_dekan' || (verifier.jabatan ?? '').toLowerCase().includes('wakil dekan')) return true;
    if (!leaderMahasiswaId || !verifier.prodi) return false;
    const leader = await this.mahasiswaService.getMahasiswaById(leaderMahasiswaId, sessionId);
    return verifier.prodi === leader?.prodi?.nama;
  }

  private async resolveFinalSignedFileUrl(submission: VerifierSubmission): Promise<string | null> {
    if (submission.finalSignedFileUrl) return submission.finalSignedFileUrl;
    const letters = await this.submissionRepo.findLettersBySubmissionId(submission.id);
    return letters[0]?.fileUrl || null;
  }

  async approveRequest(requestId: string, dosenId: string, role: RbacRole, sessionId: string) {
    const submission = await this.submissionRepo.findById(requestId);
    if (!submission) throw new Error('Submission not found');

    const approvedAt = new Date();
    return await this.submissionRepo.update(requestId, {
      workflowStage: 'COMPLETED',
      dosenVerificationStatus: 'APPROVED',
      dosenVerifiedAt: approvedAt,
      dosenVerifiedByDosenId: dosenId,
      updatedAt: approvedAt,
    });
  }

  async rejectRequest(requestId: string, dosenId: string, role: RbacRole, rejectionReason: string) {
    const submission = await this.submissionRepo.findById(requestId);
    if (!submission) throw new Error('Submission not found');

    const rejectedAt = new Date();
    const currentHistory = Array.isArray(submission.statusHistory) ? submission.statusHistory : [];
    const newHistory = [
      ...currentHistory,
      {
        status: 'REJECTED',
        workflowStage: 'REJECTED_DOSEN',
        actor: 'DOSEN',
        date: rejectedAt.toISOString(),
        reason: rejectionReason,
      },
    ];

    return await this.submissionRepo.update(requestId, {
      workflowStage: 'REJECTED_DOSEN',
      dosenVerificationStatus: 'REJECTED',
      dosenVerifiedAt: rejectedAt,
      dosenVerifiedByDosenId: dosenId,
      dosenRejectionReason: rejectionReason,
      rejectionReason,
      statusHistory: newHistory,
      updatedAt: rejectedAt,
    });
  }
}