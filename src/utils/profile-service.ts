// Profile Service Client using Hono's fetch
// Untuk mengakses Profile Service dan mendapatkan data profil user

export interface MahasiswaProfile {
  id: string;
  authUserId: string;
  nim: string;
  name: string;
  email: string;
  fakultas: string;
  prodi: string;
  semester: number;
  angkatan: string;
  phone?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DosenProfile {
  id: string;
  authUserId: string;
  nidn: string;
  name: string;
  email: string;
  fakultas: string;
  prodi: string;
  bidangKeahlian?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProfile {
  id: string;
  authUserId: string;
  nip: string;
  name: string;
  email: string;
  unitKerja: string;
  jabatan?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MentorProfile {
  id: string;
  authUserId: string;
  name: string;
  email: string;
  instansi: string;
  jabatan?: string;
  bidangKeahlian?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserProfile = MahasiswaProfile | DosenProfile | AdminProfile | MentorProfile;

export interface ProfileServiceResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export class ProfileServiceClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async fetchWithAuth<T>(
    endpoint: string,
    accessToken: string,
    options?: RequestInit
  ): Promise<ProfileServiceResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const error: any = await response.json().catch((e: unknown) => ({ message: 'Unknown error' }));
        return {
          success: false,
          message: error.message || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data: any = await response.json();
      return data as ProfileServiceResponse<T>;
    } catch (error) {
      console.error('Profile Service error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Profile Service unavailable',
      };
    }
  }

  // Get current user's profiles (can have multiple profiles)
  async getCurrentUserProfiles(accessToken: string): Promise<ProfileServiceResponse<UserProfile[]>> {
    return this.fetchWithAuth<UserProfile[]>('/api/me', accessToken);
  }

  // Get mahasiswa profile by auth user ID
  async getMahasiswaByAuthUserId(authUserId: string, accessToken: string): Promise<ProfileServiceResponse<MahasiswaProfile>> {
    return this.fetchWithAuth<MahasiswaProfile>(
      `/api/mahasiswa?authUserId=${authUserId}`,
      accessToken
    );
  }

  // Get mahasiswa profile by ID
  async getMahasiswaById(id: string, accessToken: string): Promise<ProfileServiceResponse<MahasiswaProfile>> {
    return this.fetchWithAuth<MahasiswaProfile>(`/api/mahasiswa/${id}`, accessToken);
  }

  // Get mahasiswa profile by NIM
  async getMahasiswaByNim(nim: string, accessToken: string): Promise<ProfileServiceResponse<MahasiswaProfile>> {
    return this.fetchWithAuth<MahasiswaProfile>(`/api/mahasiswa/nim/${nim}`, accessToken);
  }

  // Get dosen profile by auth user ID
  async getDosenByAuthUserId(authUserId: string, accessToken: string): Promise<ProfileServiceResponse<DosenProfile>> {
    return this.fetchWithAuth<DosenProfile>(
      `/api/dosen?authUserId=${authUserId}`,
      accessToken
    );
  }

  // Get dosen profile by ID
  async getDosenById(id: string, accessToken: string): Promise<ProfileServiceResponse<DosenProfile>> {
    return this.fetchWithAuth<DosenProfile>(`/api/dosen/${id}`, accessToken);
  }

  // Get admin profile by auth user ID
  async getAdminByAuthUserId(authUserId: string, accessToken: string): Promise<ProfileServiceResponse<AdminProfile>> {
    return this.fetchWithAuth<AdminProfile>(
      `/api/admin?authUserId=${authUserId}`,
      accessToken
    );
  }

  // Get admin profile by ID
  async getAdminById(id: string, accessToken: string): Promise<ProfileServiceResponse<AdminProfile>> {
    return this.fetchWithAuth<AdminProfile>(`/api/admin/${id}`, accessToken);
  }

  // Get mentor profile by auth user ID
  async getMentorByAuthUserId(authUserId: string, accessToken: string): Promise<ProfileServiceResponse<MentorProfile>> {
    return this.fetchWithAuth<MentorProfile>(
      `/api/mentor?authUserId=${authUserId}`,
      accessToken
    );
  }

  // Get mentor profile by ID
  async getMentorById(id: string, accessToken: string): Promise<ProfileServiceResponse<MentorProfile>> {
    return this.fetchWithAuth<MentorProfile>(`/api/mentor/${id}`, accessToken);
  }

  // List mahasiswa (admin only)
  async listMahasiswa(
    accessToken: string,
    params?: { page?: number; limit?: number; search?: string }
  ): Promise<ProfileServiceResponse<{ data: MahasiswaProfile[]; pagination: any }>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);

    const endpoint = `/api/mahasiswa${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    return this.fetchWithAuth(endpoint, accessToken);
  }

  // List dosen (admin only)
  async listDosen(
    accessToken: string,
    params?: { page?: number; limit?: number; search?: string }
  ): Promise<ProfileServiceResponse<{ data: DosenProfile[]; pagination: any }>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);

    const endpoint = `/api/dosen${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    return this.fetchWithAuth(endpoint, accessToken);
  }
}

// Helper function to get user's primary profile (first one)
export function getPrimaryProfile(profiles: UserProfile[]): UserProfile | null {
  return profiles.length > 0 ? profiles[0] : null;
}

// Helper function to check if user is mahasiswa
export function isMahasiswaProfile(profile: UserProfile): profile is MahasiswaProfile {
  return 'nim' in profile;
}

// Helper function to check if user is dosen
export function isDosenProfile(profile: UserProfile): profile is DosenProfile {
  return 'nidn' in profile;
}

// Helper function to check if user is admin
export function isAdminProfile(profile: UserProfile): profile is AdminProfile {
  return 'nip' in profile && 'unitKerja' in profile;
}

// Helper function to check if user is mentor
export function isMentorProfile(profile: UserProfile): profile is MentorProfile {
  return 'instansi' in profile && !('nim' in profile) && !('nidn' in profile) && !('nip' in profile);
}
