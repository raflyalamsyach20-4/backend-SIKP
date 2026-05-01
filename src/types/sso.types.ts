import { type JWTPayload as JoseJWTPayload } from "jose";

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

export interface SsoDosenResponse {
  success: boolean;
  data: SsoDosenDetail;
}
export interface SsoMahasiswaDetail extends SsoMahasiswaIdentity {
  profile: SsoProfile;
}

export interface SsoMahasiswaResponse {
  success: boolean;
  data: SsoMahasiswaDetail;
}

export interface SsoMahasiswaSearchResponse {
  success: boolean;
  data: SsoMahasiswaDetail[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type DosenJabatanStruktural = "DEKAN" | "WAKIL_DEKAN" | "KAPRODI";

export type DosenJabatanFungsional = "GURU_BESAR" | "LEKTOR_KEPALA" | "LEKTOR" | "ASISTEN_AHLI";

export interface SsoActiveSignature {
  signatureId: string;
  createdAt: string;
  isActive: boolean;
  signatureHash: string;
  mimeType: string;
  svg: string;
}

export interface SsoSignatureResponse {
  success: boolean;
  data: {
    activeSignature: SsoActiveSignature | null;
  };
}