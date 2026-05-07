import { createDbClient } from '@/db';
import { MahasiswaRepository } from '@/repositories/mahasiswa.repository';
import { MentorRepository } from '@/repositories/mentor.repository';
import { MahasiswaService } from './mahasiswa.service';
import { DosenService } from './dosen.service';
import { StorageService } from './storage.service';

export class InternshipService {
  private mahasiswaRepo: MahasiswaRepository;
  private mentorRepo: MentorRepository;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;
  private storageService: StorageService;

  constructor(private env: CloudflareBindings) {
    const db = createDbClient(this.env.DATABASE_URL);
    this.mahasiswaRepo = new MahasiswaRepository(db);
    this.mentorRepo = new MentorRepository(db);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.dosenService = new DosenService(this.env);
    this.storageService = new StorageService(this.env);
  }

  /**
   * Get complete internship data including student, submission, internship, mentor, and lecturer info
   */
  async getInternshipData(userId: string, sessionId: string) {
    // 1. Resolve Student Details from SSO first to get the correct internal Profile ID
    // All local DB queries must use profile.id (Mahasiswa ID), not the auth userId (SSO ID)
    const studentProfile = await this.mahasiswaService.getMahasiswaById(userId, sessionId);
    if (!studentProfile) {
      console.error(`[InternshipService.getInternshipData] Mahasiswa profile not found in SSO for userId: ${userId}`);
      return null; // Return null instead of throw to avoid frontend crash
    }

    const mahasiswaId = studentProfile.profile.id;

    // 2. Fetch data from local repository using the resolved mahasiswaId
    const data = await this.mahasiswaRepo.getInternshipData(mahasiswaId);
    
    if (!data) {
      console.warn(`[InternshipService.getInternshipData] No local internship data found for mahasiswaId: ${mahasiswaId}`);
      return null;
    }

    // 3. Resolve Mentor Details
    let mentor = null;
    if (data.pembimbingLapanganId) {
      // 1. Try to get mentor profile (might be reserved/incomplete in SSO)
      const mentorProfile = await this.mentorRepo.findProfileById(data.pembimbingLapanganId);
      
      // 2. Fallback to mentor_approval_requests to get real contact info (Email, Phone, etc)
      // because SSO data might be 'Reserved' or empty during the sync phase.
      const approvalRequest = await this.mentorRepo.findRequestBySsoMentorId(data.pembimbingLapanganId);

      if (mentorProfile) {
        mentor = {
          id: mentorProfile.id,
          name: approvalRequest?.mentorName || 'Mentor (Identity Reserved)',
          email: approvalRequest?.mentorEmail || '',
          company: approvalRequest?.companyName || data.company || '',
          position: approvalRequest?.position || '',
          phone: approvalRequest?.mentorPhone || '',
          status: 'approved',
          signature: mentorProfile.signatureUrl ? this.storageService.getAssetProxyUrl(mentorProfile.signatureUrl) : null,
        };
      } else {
        mentor = {
          id: data.pembimbingLapanganId,
          name: approvalRequest?.mentorName || 'Mentor (Identity Reserved)',
          email: approvalRequest?.mentorEmail || '',
          company: approvalRequest?.companyName || data.company || '',
          position: approvalRequest?.position || '',
          phone: approvalRequest?.mentorPhone || '',
          status: 'registered',
          signature: null,
        };
      }
    } else {
      // 3. If NO pembimbingLapanganId, check for PENDING or REJECTED requests in mentor_approval_requests
      const activeRequest = await this.mentorRepo.findLatestRequestByMahasiswaId(mahasiswaId);
      if (activeRequest) {
        mentor = {
          id: activeRequest.id,
          name: activeRequest.mentorName,
          email: activeRequest.mentorEmail,
          company: activeRequest.companyName,
          position: activeRequest.position,
          phone: activeRequest.mentorPhone,
          status: activeRequest.status.toLowerCase(), // 'pending' or 'rejected'
          rejectionReason: activeRequest.rejectionReason,
          createdAt: activeRequest.createdAt,
        };
      }
    }

    // Resolve Lecturer Details from SSO
    let lecturer = null;
    if (data.dosenPembimbingId) {
      const lecturerProfile = await this.dosenService.getDosenById(data.dosenPembimbingId, sessionId);
      if (lecturerProfile) {
        lecturer = {
          id: data.dosenPembimbingId,
          name: lecturerProfile.profile.fullName || '',
          email: lecturerProfile.profile.emails.find(e => e.isPrimary)?.email || '',
          nip: lecturerProfile.nidn || '',
          phone: '',
          jabatan: lecturerProfile.jabatanFungsional || '',
        };
      }
    }

    return {
      student: {
        id: studentProfile.profile.id,
        name: studentProfile.profile.fullName,
        nim: studentProfile.nim,
        email: studentProfile.profile.emails.find(e => e.isPrimary)?.email || '',
        prodi: studentProfile.prodi?.nama || '',
        fakultas: studentProfile.fakultas?.nama || '',
        angkatan: studentProfile.angkatan.toString() || '',
        semester: studentProfile.semesterAktif || 0,
      },
      submission: {
        id: data.submissionId,
        teamId: data.teamId,
        company: data.company,
        companyAddress: data.companyAddress || '',
        division: data.division || '',
        startDate: data.submissionStartDate,
        endDate: data.submissionEndDate,
        status: data.submissionStatus,
        submittedAt: data.submittedAt,
        approvedAt: data.approvedAt,
        approvedBy: data.approvedBy,
      },
      internship: data.internshipId ? {
        id: data.internshipId,
        status: data.internshipStatus,
        studentId: data.studentId,
        submissionId: data.submissionId,
        mentorId: data.pembimbingLapanganId,
        supervisorId: data.dosenPembimbingId,
        startDate: data.internshipStartDate,
        endDate: data.internshipEndDate,
        createdAt: data.internshipCreatedAt,
        updatedAt: data.internshipUpdatedAt,
      } : null,
      mentor,
      lecturer,
    };
  }
}

