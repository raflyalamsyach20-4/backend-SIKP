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
    emails: {
      email: string;
      isPrimary: boolean;
      isInstitutional: boolean;
    }[];
    id: string;
  };
  profileId: string;
  nidn: string;
}

export interface SsoMahasiswaIdentity {
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
  nidn: string;
  bidangKeahlian: string | null;
  jabatanFungsional: string | null;
  jabatanStruktural: string[] | null;
  prodi: SsoProdi | null;
  fakultas: SsoFakultas | null;
}

export interface SsoAdminIdentity {
  nip: string | null;
  jabatan: string;
  prodi: SsoProdi | null;
  fakultas: SsoFakultas | null;
}

export interface SsoMentorIdentity {
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

export interface SsoProfile {
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
  data: SsoProfile | null;
  success: boolean;
}

export type SsoAccessTokenPayload = JoseJWTPayload & {
  scope: string[];
  roles: RbacRole[];
  permissions: string[];
};
