export type UserRole = 'MAHASISWA' | 'ADMIN' | 'DOSEN' | 'KAPRODI' | 'WAKIL_DEKAN' | 'PEMBIMBING_LAPANGAN';
export type TeamStatus = 'PENDING' | 'FIXED';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type SubmissionStatus = 'DRAFT' | 'MENUNGGU' | 'DITOLAK' | 'DITERIMA';
export type DocumentType = 'KTP' | 'TRANSKRIP' | 'KRS' | 'PROPOSAL' | 'OTHER';

// Base User interface
export interface User {
  id: string;
  nama: string | null;
  email: string;
  password: string;
  role: UserRole;
  phone: string | null;
  isActive: boolean;
}

// Mahasiswa interface
export interface Mahasiswa {
  nim: string;
  id: string;
  fakultas: string | null;
  prodi: string | null;
  semester: number | null;
  angkatan: string | null;
}

// Admin interface
export interface Admin {
  id: string;
  nip: string;
  fakultas: string | null;
  prodi: string | null;
}

// Dosen interface
export interface Dosen {
  id: string;
  nip: string;
  jabatan: string | null;
  fakultas: string | null;
  prodi: string | null;
}

// Pembimbing Lapangan interface
export interface PembimbingLapangan {
  id: string;
  companyName: string | null;
  position: string | null;
  companyAddress: string | null;
}

export interface Team {
  id: string;
  code: string;
  leaderId: string;
  status: TeamStatus;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  invitationStatus: InvitationStatus;
  invitedAt: Date;
  respondedAt: Date | null;
}

export interface Submission {
  id: string;
  teamId: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string | null;
  companyEmail: string | null;
  companySupervisor: string | null;
  position: string | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
  status: SubmissionStatus;
  rejectionReason: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionDocument {
  id: string;
  submissionId: string;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  documentType: DocumentType;
  uploadedBy: string;
  createdAt: Date;
}

export interface GeneratedLetter {
  id: string;
  submissionId: string;
  letterNumber: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  generatedBy: string;
  generatedAt: Date;
  createdAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  nim?: string; // Optional for mahasiswa
  nip?: string; // Optional for admin/dosen
}
