export type UserRole =
  | "MAHASISWA"
  | "ADMIN"
  | "DOSEN"
  | "KAPRODI"
  | "WAKIL_DEKAN"
  | "MENTOR";
export type EffectivePermission = string;
export type AuthProvider = "SSO_UNSRI";
export type TeamStatus = "PENDING" | "FIXED";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type SubmissionStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED";
export type SubmissionVerificationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type SubmissionWorkflowStage =
  | "DRAFT"
  | "PENDING_ADMIN_REVIEW"
  | "PENDING_DOSEN_VERIFICATION"
  | "COMPLETED"
  | "REJECTED_ADMIN"
  | "REJECTED_DOSEN";
export type DocumentType = "KTP" | "TRANSKRIP" | "KRS" | "PROPOSAL" | "OTHER";
// ✅ NEW: Document status type
export type DocumentStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ResponseLetterStatus = "approved" | "rejected";
export type ResponseLetterTrackingStatus = "pending" | "submitted" | "verified";

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
  jumlahSksSelesai: number | null;
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
  esignatureUrl?: string | null;
  esignatureKey?: string | null;
  esignatureUploadedAt?: Date | null;
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
  dosenKpId?: string | null;
  dosenKpName?: string | null;
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
  companyBusinessType: string | null;
  division: string | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
  status: SubmissionStatus;
  adminVerificationStatus: SubmissionVerificationStatus;
  adminVerifiedAt?: Date | null;
  adminVerifiedBy?: string | null;
  adminRejectionReason?: string | null;
  dosenVerificationStatus: SubmissionVerificationStatus;
  dosenVerifiedAt?: Date | null;
  dosenVerifiedBy?: string | null;
  dosenRejectionReason?: string | null;
  workflowStage: SubmissionWorkflowStage;
  finalSignedFileUrl?: string | null;
  rejectionReason: string | null;
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
  // ✅ NEW: Document status fields
  status?: DocumentStatus;
  statusUpdatedAt?: Date;
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

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

export interface AuthIdentity {
  identityType: string;
  roleName: string;
  permissions?: EffectivePermission[];
  identityId?: string | null;
  displayName?: string | null;
  identifier?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface JWTPayload {
  sub: string;
  userId: string; // ✅ Primary user identifier (always set to profileId or authUserId)
  authUserId?: string;
  sessionId?: string;
  email: string;
  role: UserRole;
  effectiveRoles?: UserRole[];
  effectivePermissions?: EffectivePermission[];
  activeIdentity?: AuthIdentity | null;
  availableIdentities?: AuthIdentity[];
  profileId?: string | null; // ✅ SSO profile ID from identity
  dosenPAId?: string | null; // ✅ Dosen PA ID untuk mahasiswa
  nim?: string | null;
  nip?: string | null;
  nidn?: string | null;
  phone?: string | null;
  jabatan?: string | null;
  jabatanFungsional?: string | null;
  jabatanStruktural?: string[] | null;
  angkatan?: number | null;
  semester?: number | null;
  semesterAktif?: number | null;
  jumlahSksLulus?: number | null;
  prodi?: string | null;
  fakultas?: string | null;
}

export interface AuthSessionContext {
  sessionId: string;
  authUserId: string;
  user: JWTPayload;
  activeIdentity: AuthIdentity | null;
  availableIdentities: AuthIdentity[];
  effectiveRoles: UserRole[];
  effectivePermissions: EffectivePermission[];
  expiresAt: Date;
  accessToken?: string | null;
  refreshToken?: string | null;
}
// Template Field interface
export interface TemplateField {
  variable: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "time" | "email" | "select";
  required: boolean;
  placeholder?: string;
  order: number;
  options?: Array<{ value: string; label: string }>; // For select type
}

// Template interface
export interface Template {
  id: string;
  name: string;
  type: "Template Only" | "Generate & Template";
  description?: string | null;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  originalName: string;
  fields?: TemplateField[] | null;
  version: number;
  isActive: boolean;
  createdBy: string;
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Response Letter interface
export interface ResponseLetter {
  id: string;
  submissionId: string | null;
  originalName: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  fileUrl: string | null;
  memberUserId: string | null;
  letterStatus: ResponseLetterStatus;
  studentName: string | null;
  studentNim: string | null;
  companyName: string | null;
  supervisorName: string | null;
  memberCount: number | null;
  roleLabel: string | null;
  membersSnapshot: Array<{
    id: number | string;
    name: string;
    nim: string;
    prodi?: string;
    role?: string;
  }> | null;
  submittedAt: Date;
  verified: boolean;
  verifiedAt: Date | null;
  verifiedByAdminId: string | null;
}

// Response Letter with relations
export interface ResponseLetterWithDetails extends ResponseLetter {
  submission?: Submission;
  team?: Team & {
    academicSupervisor?: string | null;
    dosenKpName?: string | null;
    members?: Array<{
      id: string;
      user: User & { mahasiswaProfile?: Mahasiswa };
      role?: string;
      status?: string;
    }>;
  };
  memberUser?: User & { mahasiswaProfile?: Mahasiswa };
  verifiedBy?: User;
  leader?: User & { mahasiswaProfile?: Mahasiswa };
  members?: Array<User & { mahasiswaProfile?: Mahasiswa; role?: string }>;
}
