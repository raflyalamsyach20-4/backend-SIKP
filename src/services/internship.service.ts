import { createDbClient } from '@/db';
import { MahasiswaRepository } from '@/repositories/mahasiswa.repository';
import { MentorRepository } from '@/repositories/mentor.repository';
import { MahasiswaService } from './mahasiswa.service';
import { DosenService } from './dosen.service';
import { StorageService } from './storage.service';
import { programStudies, mentorSignatures } from '@/db/schema';
import { eq } from 'drizzle-orm';

export class InternshipService {
  private mahasiswaRepo: MahasiswaRepository;
  private mentorRepo: MentorRepository;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;
  private storageService: StorageService;
  private db: any;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.mahasiswaRepo = new MahasiswaRepository(this.db);
    this.mentorRepo = new MentorRepository(this.db);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.dosenService = new DosenService(this.env);
    this.storageService = new StorageService(this.env);
  }

  /**
   * Get complete internship data including student, submission, internship, mentor, and lecturer info
   */
  async getInternshipData(userId: string, sessionId: string) {
    // 1. Resolve Student Details from SSO first to get the correct internal Profile ID
    const studentProfile = await this.mahasiswaService.getMahasiswaById(userId, sessionId);
    if (!studentProfile) {
      console.error(`[InternshipService.getInternshipData] Mahasiswa profile not found in SSO for userId: ${userId}`);
      return null;
    }

    const mahasiswaId = studentProfile.id;

    // 2. Fetch data from local repository using the resolved mahasiswaId
    const data = await this.mahasiswaRepo.getInternshipData(mahasiswaId);
    
    // 3. Resolve Mentor Details
    let mentor = null;
    if (data.pembimbingLapanganId) {
      const mentorProfile = await this.mentorRepo.findProfileById(data.pembimbingLapanganId);
      let approvalRequest = await this.mentorRepo.findRequestBySsoMentorId(data.pembimbingLapanganId);
      
      if (!approvalRequest) {
        approvalRequest = await this.mentorRepo.findLatestRequestByMahasiswaId(mahasiswaId);
      }

      if (mentorProfile) {
        mentor = {
          id: mentorProfile.id,
          name: (approvalRequest?.status === 'APPROVED' ? approvalRequest?.mentorName : null) || mentorProfile.id,
          email: approvalRequest?.mentorEmail || '',
          company: approvalRequest?.companyName || data.company || '',
          position: approvalRequest?.position || '',
          phone: approvalRequest?.mentorPhone || '',
          status: 'approved',
          companyAddress: approvalRequest?.companyAddress || '',
          signature: mentorProfile.signatureUrl ? this.storageService.getAssetProxyUrl(mentorProfile.signatureUrl) : null,
        };
        
        if (approvalRequest) {
          mentor.name = approvalRequest.mentorName;
        }
      } else {
        if (approvalRequest?.ssoMentorId) {
          const fallbackProfile = await this.mentorRepo.findProfileById(approvalRequest.ssoMentorId);
          if (fallbackProfile) {
            mentor = {
              id: fallbackProfile.id,
              name: approvalRequest.mentorName,
              email: approvalRequest.mentorEmail || '',
              company: approvalRequest.companyName || data.company || '',
              position: approvalRequest.position || '',
              phone: approvalRequest.mentorPhone || '',
              status: 'approved',
              companyAddress: approvalRequest.companyAddress || '',
              signature: fallbackProfile.signatureUrl ? this.storageService.getAssetProxyUrl(fallbackProfile.signatureUrl) : null,
            };
          }
        }

        if (!mentor) {
          mentor = {
            id: data.pembimbingLapanganId,
            name: approvalRequest?.mentorName || 'Mentor (Identity Reserved)',
            email: approvalRequest?.mentorEmail || '',
            company: approvalRequest?.companyName || data.company || '',
            position: approvalRequest?.position || '',
            phone: approvalRequest?.mentorPhone || '',
            status: 'registered',
            companyAddress: approvalRequest?.companyAddress || '',
            signature: null,
          };
        }
      }
    } else {
      let activeRequest = await this.mentorRepo.findLatestRequestByMahasiswaId(mahasiswaId);
      if (activeRequest) {
        mentor = {
          id: activeRequest.id,
          name: activeRequest.mentorName,
          email: activeRequest.mentorEmail,
          company: activeRequest.companyName,
          position: activeRequest.position,
          phone: activeRequest.mentorPhone,
          status: activeRequest.status.toLowerCase(),
          companyAddress: activeRequest.companyAddress,
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
          nip: lecturerProfile.nip || lecturerProfile.nidn || '',
          phone: '',
          jabatan: lecturerProfile.jabatanFungsional || '',
          signature: (lecturerProfile as any).signatureUrl ? this.storageService.getAssetProxyUrl((lecturerProfile as any).signatureUrl) : null,
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
        angkatan: studentProfile.angkatan?.toString() || '',
        semester: studentProfile.semesterAktif || 0,
      },
      submission: data ? {
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
      } : null,
      internship: (data && data.internshipId) ? {
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
      coordinator: await this.resolveCoordinator(studentProfile.prodi?.nama, sessionId),
    };
  }

  private async resolveCoordinator(prodiName: string | undefined, sessionId: string) {
    if (!prodiName) return null;

    try {
      const [prodi] = await this.db
        .select()
        .from(programStudies)
        .where(eq(programStudies.nama, prodiName))
        .limit(1);

      if (!prodi || !prodi.coordinatorId) {
        if (prodiName.includes('Manajemen Informatika')) {
           return {
             name: "Dr. Abdiansah, S.Kom., M.Cs.",
             nip: "198410012009121005",
             signature: null
           };
        }
        return null;
      }

      const coordinatorProfile = await this.dosenService.getDosenById(prodi.coordinatorId, sessionId);
      const [signatureRecord] = await this.db
        .select()
        .from(mentorSignatures)
        .where(eq(mentorSignatures.id, prodi.coordinatorId))
        .limit(1);

      return {
        id: prodi.coordinatorId,
        name: coordinatorProfile?.profile.fullName || "Dr. Abdiansah, S.Kom., M.Cs.",
        nip: coordinatorProfile?.nip || coordinatorProfile?.nidn || "198410012009121005",
        signature: signatureRecord?.signatureUrl ? this.storageService.getAssetProxyUrl(signatureRecord.signatureUrl) : null,
      };
    } catch (err) {
      console.error(`[InternshipService.resolveCoordinator] Error:`, err);
      return null;
    }
  }
}
