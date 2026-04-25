import { eq, gt } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { teams, suratKesediaanRequests, suratPermohonanRequests, authSessions } from '@/db/schema';
import type { SsoEnvelope, SsoProfileResponse } from '@/types';

type BasicUser = {
  id: string;
  authUserId: string;
  nama: string | null;
  email: string | null;
  phone: string | null;
  role: 'MAHASISWA' | 'DOSEN' | 'ADMIN' | 'KAPRODI' | 'WAKIL_DEKAN' | 'MENTOR';
  isActive: boolean;
};

type MahasiswaProfile = {
  id: string;
  nim: string | null;
  fakultas: string | null;
  prodi: string | null;
  semester: number | null;
  jumlahSksSelesai: number | null;
  angkatan: string | null;
  dosenPaId: string | null;
  esignatureUrl: string | null;
  esignatureKey: string | null;
  esignatureUploadedAt: Date | null;
};

type DosenProfile = {
  id: string;
  nip: string | null;
  jabatan: string | null;
  fakultas: string | null;
  prodi: string | null;
  esignatureUrl: string | null;
  esignatureKey: string | null;
  esignatureUploadedAt: Date | null;
};

type AdminProfile = {
  id: string;
  nip: string | null;
};

type PembimbingLapanganProfile = {
  id: string;
};

type PublicBasicUser = Pick<BasicUser, 'id' | 'nama' | 'email' | 'phone' | 'role'>;
type MahasiswaMe = PublicBasicUser & Omit<MahasiswaProfile, 'id'>;
type DosenMe = PublicBasicUser & Omit<DosenProfile, 'id'> & { role: 'DOSEN' };
type UpdateProfilePayload = Record<string, unknown>;
type UpdatedMahasiswaProfile = { id: string; esignatureUploadedAt: Date | null } & UpdateProfilePayload;
type UpdatedDosenProfile = { id: string; esignatureUploadedAt: Date | null } & UpdateProfilePayload;
type UserWithMahasiswaProfile = BasicUser & { mahasiswaProfile: MahasiswaProfile };

export class UserRepository {
  private readonly profileCacheByProfileId = new Map<
    string,
    { profile: SsoProfileResponse; expiresAt: number }
  >();
  private readonly profileCacheByToken = new Map<
    string,
    { profile: SsoProfileResponse | null; expiresAt: number }
  >();
  private readonly PROFILE_CACHE_TTL_MS = 60 * 1000;

  constructor(
    private db: DbClient,
    private ssoIdentitiesUrl?: string,
  ) {}

  private getPrimaryEmail(profile: SsoProfileResponse): string | null {
    const primary = profile.emails.find((item) => item.isPrimary)?.email;
    return primary || profile.emails[0]?.email || null;
  }

  private mapProfileRole(profile: SsoProfileResponse): BasicUser['role'] {
    if (profile.identities.admin) {
      return 'ADMIN';
    }
    if (profile.identities.dosen) {
      return 'DOSEN';
    }
    if (profile.identities.mentor) {
      return 'MENTOR';
    }
    return 'MAHASISWA';
  }

  private toBasicUserFromProfile(profile: SsoProfileResponse): BasicUser {
    return {
      id: profile.id,
      authUserId: profile.authUserId || profile.id,
      nama: profile.fullName || null,
      email: this.getPrimaryEmail(profile),
      phone: profile.identities.mentor?.noTelepon || null,
      role: this.mapProfileRole(profile),
      isActive: true,
    };
  }

  private toMahasiswaProfileFromSso(profile: SsoProfileResponse): MahasiswaProfile {
    const mahasiswa = profile.identities.mahasiswa;
    return {
      id: profile.id,
      nim: mahasiswa?.nim || null,
      fakultas: mahasiswa?.fakultas?.nama || null,
      prodi: mahasiswa?.prodi?.nama || null,
      semester: mahasiswa?.semesterAktif || null,
      jumlahSksSelesai: mahasiswa?.jumlahSksLulus || null,
      angkatan: mahasiswa?.angkatan
        ? String(mahasiswa.angkatan)
        : null,
      dosenPaId: mahasiswa?.dosenPA?.profileId || null,
      esignatureUrl: null,
      esignatureKey: null,
      esignatureUploadedAt: null,
    };
  }

  private toDosenProfileFromSso(profile: SsoProfileResponse): DosenProfile {
    const dosen = profile.identities.dosen;
    const admin = profile.identities.admin;
    return {
      id: profile.id,
      nip: admin?.nip || null,
      jabatan: dosen?.jabatanFungsional || null,
      fakultas: dosen?.fakultas?.nama || admin?.fakultas?.nama || null,
      prodi: dosen?.prodi?.nama || admin?.prodi?.nama || null,
      esignatureUrl: null,
      esignatureKey: null,
      esignatureUploadedAt: null,
    };
  }

  private async fetchProfileFromSsoByToken(
    accessToken: string,
  ): Promise<SsoProfileResponse | null> {
    if (!this.ssoIdentitiesUrl) {
      return null;
    }

    const now = Date.now();
    const cached = this.profileCacheByToken.get(accessToken);
    if (cached && cached.expiresAt > now) {
      return cached.profile;
    }

    try {
      const response = await fetch(this.ssoIdentitiesUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        this.profileCacheByToken.set(accessToken, {
          profile: null,
          expiresAt: now + this.PROFILE_CACHE_TTL_MS,
        });
        return null;
      }

      const payload = (await response.json()) as SsoEnvelope;
      const profile = payload?.data || null;

      this.profileCacheByToken.set(accessToken, {
        profile,
        expiresAt: now + this.PROFILE_CACHE_TTL_MS,
      });

      return profile;
    } catch {
      this.profileCacheByToken.set(accessToken, {
        profile: null,
        expiresAt: now + this.PROFILE_CACHE_TTL_MS,
      });
      return null;
    }
  }

  private async resolveProfileByProfileId(
    profileId: string,
  ): Promise<SsoProfileResponse | null> {
    if (!profileId || !this.ssoIdentitiesUrl) {
      return null;
    }

    const now = Date.now();
    const cachedProfile = this.profileCacheByProfileId.get(profileId);
    if (cachedProfile && cachedProfile.expiresAt > now) {
      return cachedProfile.profile;
    }

    const sessions = await this.db
      .select({
        accessToken: authSessions.accessToken,
        expiresAt: authSessions.expiresAt,
      })
      .from(authSessions)
      .where(gt(authSessions.expiresAt, new Date()))
      .limit(100);

    for (const session of sessions) {
      const token = session.accessToken;
      if (!token) {
        continue;
      }

      const profile = await this.fetchProfileFromSsoByToken(token);
      if (!profile || profile.id !== profileId) {
        continue;
      }

      const expiresAt = Math.min(
        session.expiresAt.getTime(),
        now + this.PROFILE_CACHE_TTL_MS,
      );

      this.profileCacheByProfileId.set(profileId, {
        profile,
        expiresAt,
      });

      return profile;
    }

    return null;
  }

  private async inferRole(userId: string): Promise<BasicUser['role']> {
    const dosenInTeam = await this.db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.dosenKpId, userId))
      .limit(1);

    if (dosenInTeam.length > 0) {
      return 'DOSEN';
    }

    const dosenInKesediaan = await this.db
      .select({ id: suratKesediaanRequests.id })
      .from(suratKesediaanRequests)
      .where(eq(suratKesediaanRequests.dosenId, userId))
      .limit(1);

    if (dosenInKesediaan.length > 0) {
      return 'DOSEN';
    }

    const dosenInPermohonan = await this.db
      .select({ id: suratPermohonanRequests.id })
      .from(suratPermohonanRequests)
      .where(eq(suratPermohonanRequests.dosenId, userId))
      .limit(1);

    if (dosenInPermohonan.length > 0) {
      return 'DOSEN';
    }

    return 'MAHASISWA';
  }

  private async synthesizeUser(userId: string): Promise<BasicUser> {
    const role = await this.inferRole(userId);

    return {
      id: userId,
      authUserId: userId,
      nama: null,
      email: null,
      phone: null,
      role,
      isActive: true,
    };
  }

  async getRandomDosenPA(): Promise<DosenProfile | null> {
    return null;
  }

  async findByEmail(_email: string): Promise<BasicUser | null> {
    return null;
  }

  async findByAuthUserId(authUserId: string): Promise<BasicUser> {
    return this.synthesizeUser(authUserId);
  }

  async findById(id: string): Promise<BasicUser> {
    const resolvedProfile = await this.resolveProfileByProfileId(id);
    if (resolvedProfile) {
      return this.toBasicUserFromProfile(resolvedProfile);
    }

    return this.synthesizeUser(id);
  }

  async create(data: { id?: string; authUserId?: string }): Promise<BasicUser | null> {
    const id = data.id || data.authUserId;
    if (!id) {
      return null;
    }
    return this.synthesizeUser(id);
  }

  async upsertFromSSO(data: { authUserId: string }): Promise<BasicUser> {
    return this.synthesizeUser(data.authUserId);
  }

  async update(id: string, _data: UpdateProfilePayload): Promise<BasicUser> {
    return this.synthesizeUser(id);
  }

  async findMahasiswaByNim(_nim: string): Promise<MahasiswaProfile | null> {
    return null;
  }

  async findMahasiswaByUserId(userId: string): Promise<MahasiswaProfile> {
    const resolvedProfile = await this.resolveProfileByProfileId(userId);
    if (resolvedProfile && resolvedProfile.identities.mahasiswa) {
      return this.toMahasiswaProfileFromSso(resolvedProfile);
    }

    return {
      id: userId,
      nim: null,
      fakultas: null,
      prodi: null,
      semester: null,
      jumlahSksSelesai: null,
      angkatan: null,
      dosenPaId: null,
      esignatureUrl: null,
      esignatureKey: null,
      esignatureUploadedAt: null,
    };
  }

  async countMahasiswaBySemester(_semester: number): Promise<number> {
    return 0;
  }

  async createMahasiswa(data: { id?: string }): Promise<{ id: string | null; esignatureUploadedAt: Date | null }> {
    return {
      id: data.id || null,
      esignatureUploadedAt: null,
    };
  }

  async updateMahasiswa(_nim: string, data: UpdateProfilePayload): Promise<UpdateProfilePayload> {
    return data;
  }

  async updateMahasiswaByUserId(userId: string, data: UpdateProfilePayload): Promise<UpdatedMahasiswaProfile> {
    return {
      id: userId,
      esignatureUploadedAt: null,
      ...data,
    };
  }

  async getMahasiswaMe(userId: string): Promise<MahasiswaMe> {
    const user = await this.findById(userId);
    const profile = await this.findMahasiswaByUserId(userId);

    return {
      id: user.id,
      nama: user.nama,
      email: user.email,
      role: user.role,
      phone: user.phone,
      nim: profile.nim,
      fakultas: profile.fakultas,
      prodi: profile.prodi,
      semester: profile.semester,
      jumlahSksSelesai: profile.jumlahSksSelesai,
      angkatan: profile.angkatan,
      dosenPaId: profile.dosenPaId,
      esignatureUrl: null,
      esignatureKey: null,
      esignatureUploadedAt: null,
    };
  }

  async findAdminByNip(_nip: string): Promise<AdminProfile | null> {
    return null;
  }

  async findAdminByUserId(_userId: string): Promise<AdminProfile | null> {
    return null;
  }

  async createAdmin(data: { id?: string }): Promise<{ id: string | null }> {
    return {
      id: data.id || null,
    };
  }

  async findDosenByNip(_nip: string): Promise<DosenProfile | null> {
    return null;
  }

  async findDosenByUserId(userId: string): Promise<DosenProfile> {
    const resolvedProfile = await this.resolveProfileByProfileId(userId);
    if (resolvedProfile && (resolvedProfile.identities.dosen || resolvedProfile.identities.admin)) {
      return this.toDosenProfileFromSso(resolvedProfile);
    }

    return {
      id: userId,
      nip: null,
      jabatan: null,
      fakultas: null,
      prodi: null,
      esignatureUrl: null,
      esignatureKey: null,
      esignatureUploadedAt: null,
    };
  }

  async findActiveDosenByProdi(_prodi: string): Promise<DosenProfile[]> {
    return [];
  }

  async findAnyActiveDosen(): Promise<DosenProfile[]> {
    return [];
  }

  async createDosen(data: { id?: string }): Promise<{ id: string | null; esignatureUploadedAt: Date | null }> {
    return {
      id: data.id || null,
      esignatureUploadedAt: null,
    };
  }

  async updateDosenByUserId(userId: string, data: UpdateProfilePayload): Promise<UpdatedDosenProfile> {
    return {
      id: userId,
      esignatureUploadedAt: null,
      ...data,
    };
  }

  async getDosenMe(userId: string): Promise<DosenMe> {
    const user = await this.findById(userId);
    const dosenProfile = await this.findDosenByUserId(userId);

    return {
      id: user.id,
      nama: user.nama,
      email: user.email,
      role: 'DOSEN',
      phone: user.phone,
      nip: dosenProfile.nip,
      jabatan: dosenProfile.jabatan,
      fakultas: dosenProfile.fakultas,
      prodi: dosenProfile.prodi,
      esignatureUrl: null,
      esignatureKey: null,
      esignatureUploadedAt: null,
    };
  }

  async findPembimbingLapanganByUserId(_userId: string): Promise<PembimbingLapanganProfile | null> {
    return null;
  }

  async createPembimbingLapangan(data: { id?: string }): Promise<{ id: string | null }> {
    return {
      id: data.id || null,
    };
  }

  async getUserWithProfile(userId: string): Promise<UserWithMahasiswaProfile> {
    const user = await this.synthesizeUser(userId);
    const mahasiswaProfile = await this.findMahasiswaByUserId(userId);

    return {
      ...user,
      mahasiswaProfile,
    };
  }

  async findByNim(_nim: string): Promise<BasicUser | null> {
    return null;
  }

  async searchMahasiswa(_query: string): Promise<MahasiswaProfile[]> {
    return [];
  }
}
