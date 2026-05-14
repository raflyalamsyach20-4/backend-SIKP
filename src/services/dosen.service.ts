import { createDbClient } from '@/db';
import { 
  TeamRepository, 
  SuratKesediaanRepository, 
  SuratPermohonanRepository,
  AuthSessionRepository
} from '@/repositories';
import { SuratPengantarDosenService } from './surat-pengantar-dosen.service';
import { AuthService } from './auth.service';
import type { RbacRole, SsoDosenDetail, SsoDosenResponse } from '@/types';

type DashboardActivity = {
  action: string;
  time: string;
  status: 'success' | 'info';
};

type DosenDashboardPayload = {
  totalMahasiswaBimbingan: number;
  totalSuratAjuanMasuk: number;
  activities: DashboardActivity[];
};

type WakdekDashboardPayload = {
  totalAjuanSuratPengantarMasuk: number;
  activities: DashboardActivity[];
};

type VerifierQueueItem = {
  isAdminApproved?: boolean;
  adminVerificationStatus?: string;
  admin_status?: string;
  adminStatus?: string;
  submissionStatus?: string;
  submission_status?: string;
};

export class DosenService {
  private teamRepository: TeamRepository;
  private suratKesediaanRepository: SuratKesediaanRepository;
  private suratPermohonanRepository: SuratPermohonanRepository;
  private authService: AuthService;
  
  private _suratPengantarDosenService?: SuratPengantarDosenService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.teamRepository = new TeamRepository(db);
    this.suratKesediaanRepository = new SuratKesediaanRepository(db);
    this.suratPermohonanRepository = new SuratPermohonanRepository(db);
    this.authService = new AuthService(this.env);
  }

  private get suratPengantarDosenService(): SuratPengantarDosenService {
    if (!this._suratPengantarDosenService) {
      this._suratPengantarDosenService = new SuratPengantarDosenService(this.env);
    }
    return this._suratPengantarDosenService;
  }

  private isWakilDekanAcademic(jabatan?: string | null): boolean {
    return (jabatan || '').toLowerCase().includes('wakil dekan');
  }

  private isAdminApprovedForVerifierQueue(item: unknown): boolean {
    if (!item || typeof item !== 'object') return false;
    const queueItem = item as VerifierQueueItem;
    if (typeof queueItem.isAdminApproved === 'boolean') return queueItem.isAdminApproved;

    const statusCandidates = [
      queueItem.adminVerificationStatus,
      queueItem.admin_status,
      queueItem.adminStatus,
      queueItem.submissionStatus,
      queueItem.submission_status,
    ]
      .filter((value): value is string => typeof value === 'string')
      .map((v: string) => v.trim().toUpperCase());

    return statusCandidates.includes('APPROVED') || statusCandidates.includes('DISETUJUI');
  }

  private async countTotalSuratPengantarMasuk(dosenId: string, role: RbacRole, sessionId: string): Promise<number> {
    const requests = await this.suratPengantarDosenService.getRequestsForVerifier(dosenId, role, sessionId);
    return requests.filter((item) => this.isAdminApprovedForVerifierQueue(item)).length;
  }

  private async countMahasiswaBimbingan(dosenId: string): Promise<number> {
    const supervisedTeams = await this.teamRepository.findByDosenKpId(dosenId);
    if (supervisedTeams.length === 0) return 0;

    const uniqueMahasiswaIds = new Set<string>();
    const teamIds = supervisedTeams.map((team) => team.id);

    supervisedTeams.forEach((team) => {
      if (team.leaderMahasiswaId) uniqueMahasiswaIds.add(team.leaderMahasiswaId);
    });

    const acceptedMembers = await this.teamRepository.findAcceptedMembersByTeamIds(teamIds);
    acceptedMembers.forEach((member) => {
      if (member.mahasiswaId) uniqueMahasiswaIds.add(member.mahasiswaId);
    });

    return uniqueMahasiswaIds.size;
  }

  private async countTotalSuratMasuk(dosenId: string): Promise<number> {
    const [kesediaan, permohonan] = await Promise.all([
      this.suratKesediaanRepository.findByDosenIdWithDetails(dosenId),
      this.suratPermohonanRepository.findByDosenIdWithDetails(dosenId),
    ]);
    return kesediaan.length + permohonan.length;
  }

  async getDashboard(dosenId: string): Promise<DosenDashboardPayload> {
    const [totalMahasiswaBimbingan, totalSuratAjuanMasuk] = await Promise.all([
      this.countMahasiswaBimbingan(dosenId),
      this.countTotalSuratMasuk(dosenId),
    ]);
    return { totalMahasiswaBimbingan, totalSuratAjuanMasuk, activities: [] };
  }

  async getWakdekDashboard(dosenId: string, role: RbacRole, sessionId: string): Promise<WakdekDashboardPayload> {
    const totalAjuanSuratPengantarMasuk = await this.countTotalSuratPengantarMasuk(dosenId, role, sessionId);
    return { totalAjuanSuratPengantarMasuk, activities: [] };
  }

  async getDosenById(dosenId: string, sessionId: string): Promise<SsoDosenDetail | null> {
    try {
      let token = await this.authService.getSessionAccessToken(sessionId);
      if (!token) {
        token = await this.authService.getServiceAccessToken();
        console.warn('[DosenService.getDosenById] Using service token fallback for dosen lookup', { dosenId });
      }
      const baseUrl = this.env.SSO_BASE_URL;
      const url = `${baseUrl}/api/dosen/${dosenId}`;

      let response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok && (response.status === 401 || response.status === 403)) {
        console.warn(`[DosenService.getDosenById] Session token rejected (${response.status}), falling back to service token`);
        const serviceToken = await this.authService.getServiceAccessToken();
        response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${serviceToken}`,
            Accept: 'application/json',
          },
        });
      }

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[DosenService.getDosenById] Dosen ID ${dosenId} not found in SSO`);
        } else if (response.status === 400) {
          console.warn(`[DosenService.getDosenById] SSO Gateway rejected ID ${dosenId} (likely non-UUID). Falling back to local cache.`);
        } else {
          throw new Error(`Failed to fetch dosen from SSO (${response.status})`);
        }

        // Fallback to local auth_sessions table (snapshot cache)
        // This is useful if dosenId is actually an authUserId (CUID)
        const authSessionRepo = new AuthSessionRepository(createDbClient(this.env.DATABASE_URL));
        const snapshot = await authSessionRepo.findProfileSnapshotByMahasiswaId(dosenId);
        
        if (snapshot) {
          console.info(`[DosenService.getDosenById] Found snapshot fallback for ${dosenId}`);
          
          // Map snapshot to SsoDosenDetail format
          const dsnIdentity = Array.isArray(snapshot.identities) 
            ? snapshot.identities.find((i: any) => i.role === 'DOSEN' || i.identityType === 'DOSEN')
            : snapshot.identities?.dosen;

          if (!dsnIdentity) return null;

          return {
            id: dsnIdentity.id,
            nip: dsnIdentity.nip || null,
            nidn: dsnIdentity.nidn || null,
            jabatanFungsional: dsnIdentity.jabatanFungsional || null,
            jabatanStruktural: dsnIdentity.jabatanStruktural || null,
            prodi: dsnIdentity.prodi || null,
            fakultas: dsnIdentity.fakultas || null,
            profile: {
              id: snapshot.authUserId,
              fullName: snapshot.fullName,
              emails: snapshot.emails || [],
            }
          } as any;
        }

        return null;
      }

      const payload = (await response.json()) as SsoDosenResponse;
      return payload.data;
    } catch (error) {
      console.error(`[DosenService.getDosenById] Error fetching from SSO:`, error);
      return null;
    }
  }
}
