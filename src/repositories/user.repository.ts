import { eq } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { teams, suratKesediaanRequests, suratPermohonanRequests } from '@/db/schema';

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
  constructor(private db: DbClient) {}

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
      .where(eq(suratKesediaanRequests.dosenUserId, userId))
      .limit(1);

    if (dosenInKesediaan.length > 0) {
      return 'DOSEN';
    }

    const dosenInPermohonan = await this.db
      .select({ id: suratPermohonanRequests.id })
      .from(suratPermohonanRequests)
      .where(eq(suratPermohonanRequests.dosenUserId, userId))
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
    const user = await this.synthesizeUser(userId);

    return {
      id: user.id,
      nama: user.nama,
      email: user.email,
      role: user.role,
      phone: user.phone,
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
    const user = await this.synthesizeUser(userId);

    return {
      id: user.id,
      nama: user.nama,
      email: user.email,
      role: 'DOSEN',
      phone: user.phone,
      nip: null,
      jabatan: null,
      fakultas: null,
      prodi: null,
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
