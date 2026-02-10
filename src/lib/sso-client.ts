/**
 * SSO Client for Backend SIKP
 * 
 * This client handles all communication with the SSO Identity Gateway.
 * DO NOT access Profile Service directly - all profile data must go through SSO.
 */

export interface SSOProfileResponse {
  success: boolean;
  data?: {
    sub: string;
    email: string;
    name: string;
    roles: string[];
    // Mahasiswa fields (if role includes MAHASISWA)
    mahasiswa?: {
      id: string;
      nim: string;
      prodi: string;
      fakultas: string;
      angkatan?: number;
    } | null;
    // Dosen fields (if role includes DOSEN)
    dosen?: {
      id: string;
      nidn: string;
      prodi: string;
      fakultas: string;
    } | null;
    // Admin fields (if role includes ADMIN)
    admin?: {
      id: string;
      level: string;
    } | null;
  };
  message?: string;
}

export interface SSOUserinfoResponse {
  sub: string;
  email: string;
  name: string;
  roles: string[];
}

/**
 * Client untuk komunikasi dengan SSO Identity Gateway
 */
export class SSOClient {
  constructor(
    private baseUrl: string,
    private token: string
  ) {}

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
        throw new Error(errorData.message || `SSO request failed: ${response.statusText}`);
      }

      return response.json();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      console.error(`[SSOClient] Error fetching ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Get full user profile with all profile data (mahasiswa/dosen/admin)
   * This is the main method to get profile information.
   */
  async getProfile(): Promise<SSOProfileResponse> {
    return this.fetch<SSOProfileResponse>('/profile');
  }

  /**
   * Get basic userinfo (lighter than full profile)
   * Use this when you only need basic info (sub, email, name, roles)
   */
  async getUserinfo(): Promise<SSOUserinfoResponse> {
    return this.fetch<SSOUserinfoResponse>('/userinfo');
  }

  /**
   * Search mahasiswa by NIM
   * Note: SSO must support this endpoint
   */
  async findMahasiswaByNim(nim: string): Promise<SSOProfileResponse> {
    return this.fetch<SSOProfileResponse>(`/profile/search?nim=${encodeURIComponent(nim)}`);
  }

  /**
   * Get mahasiswa profile by auth user ID
   * Note: This might be restricted by ownership in SSO
   */
  async getMahasiswaByAuthUserId(authUserId: string): Promise<SSOProfileResponse> {
    return this.fetch<SSOProfileResponse>(`/profile?authUserId=${encodeURIComponent(authUserId)}`);
  }
}

/**
 * Factory function to create SSO client
 */
export function createSSOClient(baseUrl: string, token: string): SSOClient {
  return new SSOClient(baseUrl, token);
}
