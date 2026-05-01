import { type JWTPayload as JoseJWTPayload } from "jose";

/**
 * Section 1: Base & Shared Types
 */
export type RbacRole = "mahasiswa" | "dosen" | "admin" | "mentor" | "wakil_dekan" | "kaprodi" | "user" | "superadmin";
export type IdentityRole = "MAHASISWA" | "DOSEN" | "ADMIN" | "MENTOR";

export interface SsoEmail {
  email: string;
  isPrimary: boolean;
  isInstitutional: boolean;
}

export interface SsoProdi {
  id: string;
  fakultasId: string;
  kode: string;
  nama: string;
}

export interface SsoFakultas {
  id: string;
  kode: string;
  nama: string;
}

/**
 * Section 2: Generic API Wrappers
 */
export interface SsoApiResponse<T> {
  success: boolean;
  data: T;
}

export interface SsoPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SsoPaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: SsoPagination;
}

/**
 * Section 3: Identity & Profile Types (Core Identity Source)
 */
export interface SsoDosenPA {
  profile: {
    fullName: string;
    emails: SsoEmail[];
    id: string;
  };
  profileId: string;
  nidn: string;
  id: string;
}

export interface SsoMahasiswaIdentity {
  id: string;
  nim: string;
  angkatan: number;
  status: string;
  semesterAktif: number;
  jumlahSksLulus: number;
  prodi: SsoProdi | null;
  fakultas: SsoFakultas | null;
  dosenPA: SsoDosenPA | null;
}

export interface SsoDosenIdentity {
  id: string;
  nip: string;
  nidn: string;
  bidangKeahlian: string | null;
  jabatanFungsional: DosenJabatanFungsional | null;
  jabatanStruktural: DosenJabatanStruktural[] | null;
  prodi: SsoProdi | null;
  fakultas: SsoFakultas | null;
}

export interface SsoAdminIdentity {
  id: string;
  nip: string | null;
  jabatan: string;
  prodi: SsoProdi | null;
  fakultas: SsoFakultas | null;
}

export interface SsoMentorIdentity {
  id: string;
  instansi: string;
  jabatan: string | null;
  bidang: string | null;
  noTelepon: string | null;
}

export type SsoProfileRoleEntry = {
  role: IdentityRole;
  fakultas: SsoFakultas | null;
  prodi: SsoProdi | null;
  isActive: boolean;
};

export interface SsoProfileResponse {
  id: string;
  authUserId: string | null;
  fullName: string;
  emails: SsoEmail[];
  identities: {
    mahasiswa: SsoMahasiswaIdentity | null;
    dosen: SsoDosenIdentity | null;
    admin: SsoAdminIdentity | null;
    mentor: SsoMentorIdentity | null;
  };
  roles: SsoProfileRoleEntry[];
}

export interface SsoEnvelope {
  data: SsoProfileResponse | null;
  success: boolean;
}

export type SsoAccessTokenPayload = JoseJWTPayload & {
  scope: string[];
  roles: RbacRole[];
  permissions: string[];
};

/**
 * Section 4: Detailed Domain Types (Detailed Profile Data)
 */
export interface SsoProfile {
  emails: SsoEmail[];
  fullName: string;
  id: string;
  authUserId: string | null;
}

export interface SsoDosenDetail {
  jabatanFungsional: DosenJabatanFungsional;
  jabatanStruktural: DosenJabatanStruktural[];
  profile: SsoProfile;
  fakultas: SsoFakultas | null;
  prodi: SsoProdi | null;
  nidn: string;
  nip: string;
  bidangKeahlian: string | null;
}

export interface SsoMahasiswaDetail extends SsoMahasiswaIdentity {
  profile: SsoProfile;
}

/**
 * Section 5: Specific API Response Types
 */
export type SsoDosenResponse = SsoApiResponse<SsoDosenDetail>;
export type SsoMahasiswaResponse = SsoApiResponse<SsoMahasiswaDetail>;
export type SsoMahasiswaSearchResponse = SsoPaginatedResponse<SsoMahasiswaDetail>;

/**
 * Section 6: Domain Specific Helpers & Enums
 */
export type DosenJabatanStruktural = "DEKAN" | "WAKIL_DEKAN" | "KAPRODI";
export type DosenJabatanFungsional = "GURU_BESAR" | "LEKTOR_KEPALA" | "LEKTOR" | "ASISTEN_AHLI";

/**
 * Section 7: Signature & Document Types
 */
export interface SsoActiveSignature {
  signatureId: string;
  createdAt: string;
  isActive: boolean;
  signatureHash: string;
  mimeType: string;
  svg: string;
}

export type SsoSignatureResponse = SsoApiResponse<{ activeSignature: SsoActiveSignature | null }>;