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

  async getRandomDosenPA(): Promise<any> {
    return null;
  }

  async findByEmail(_email: string): Promise<any> {
    return null;
  }

  async findByAuthUserId(authUserId: string): Promise<any> {
    return this.synthesizeUser(authUserId);
  }

  async findById(id: string): Promise<any> {
    return this.synthesizeUser(id);
  }

  async create(data: { id?: string; authUserId?: string }): Promise<any> {
    const id = data.id || data.authUserId;
    if (!id) {
      return null;
    }
    return this.synthesizeUser(id);
  }

  async upsertFromSSO(data: { authUserId: string }): Promise<any> {
    return this.synthesizeUser(data.authUserId);
  }

  async update(id: string, _data: Record<string, unknown>): Promise<any> {
    return this.synthesizeUser(id);
  }

  async findMahasiswaByNim(_nim: string): Promise<any> {
    return null;
  }

  async findMahasiswaByUserId(userId: string): Promise<any> {
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

  async createMahasiswa(data: { id?: string }): Promise<any> {
    return {
      id: data.id || null,
      esignatureUploadedAt: null,
    };
  }

  async updateMahasiswa(_nim: string, data: Record<string, unknown>): Promise<any> {
    return data;
  }

  async updateMahasiswaByUserId(userId: string, data: Record<string, unknown>): Promise<any> {
    return {
      id: userId,
      esignatureUploadedAt: null,
      ...data,
    };
  }

  async getMahasiswaMe(userId: string): Promise<any> {
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
      esignatureUrl: null,
      esignatureKey: null,
      esignatureUploadedAt: null,
    };
  }

  async findAdminByNip(_nip: string): Promise<any> {
    return null;
  }

  async findAdminByUserId(_userId: string): Promise<any> {
    return null;
  }

  async createAdmin(data: { id?: string }): Promise<any> {
    return {
      id: data.id || null,
    };
  }

  async findDosenByNip(_nip: string): Promise<any> {
    return null;
  }

  async findDosenByUserId(userId: string): Promise<any> {
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

  async findActiveDosenByProdi(_prodi: string): Promise<any[]> {
    return [];
  }

  async findAnyActiveDosen(): Promise<any[]> {
    return [];
  }

  async createDosen(data: { id?: string }): Promise<any> {
    return {
      id: data.id || null,
      esignatureUploadedAt: null,
    };
  }

  async updateDosenByUserId(userId: string, data: Record<string, unknown>): Promise<any> {
    return {
      id: userId,
      esignatureUploadedAt: null,
      ...data,
    };
  }

  async getDosenMe(userId: string): Promise<any> {
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

  async findPembimbingLapanganByUserId(_userId: string): Promise<any> {
    return null;
  }

  async createPembimbingLapangan(data: { id?: string }): Promise<any> {
    return {
      id: data.id || null,
    };
  }

  async getUserWithProfile(userId: string): Promise<any> {
    const user = await this.synthesizeUser(userId);
    const mahasiswaProfile = await this.findMahasiswaByUserId(userId);

    return {
      ...user,
      mahasiswaProfile,
    };
  }

  async findByNim(_nim: string): Promise<any> {
    return null;
  }

  async searchMahasiswa(_query: string): Promise<any[]> {
    return [];
  }
}
