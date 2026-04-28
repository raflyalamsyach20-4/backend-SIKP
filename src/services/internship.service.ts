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
    const data = await this.mahasiswaRepo.getInternshipData(userId);
    
    if (!data || !data.submissionId) {
      throw new Error('No active internship found for this student. Please complete your submission first.');
    }

    // Resolve Student Details from SSO
    const studentProfile = await this.mahasiswaService.getMahasiswaById(userId, sessionId);
    if (!studentProfile) {
      throw new Error('Mahasiswa profile not found in SSO');
    }

    // Resolve Mentor Details (Mentors also come from SSO in the new architecture)
    // For now, we use a simplified approach as there isn't a dedicated MentorService.getById yet.
    // We can potentially use a generic profile lookup if available.
    let mentor = null;
    if (data.pembimbingLapanganId) {
      const mentorProfile = await this.mentorRepo.findProfileById(data.pembimbingLapanganId);
      if (mentorProfile) {
        mentor = {
          id: mentorProfile.id,
          name: mentorProfile.fullName,
          email: mentorProfile.email,
          company: mentorProfile.companyName || data.company || '',
          position: mentorProfile.position || '',
          phone: mentorProfile.phone || '',
          signature: this.storageService.getAssetProxyUrl(mentorProfile.signatureUrl),
        };
      } else {
        mentor = {
          id: data.pembimbingLapanganId,
          name: 'Mentor (Identity Reserved)',
          email: '',
          company: data.company || '',
          position: '',
          phone: '',
          signature: null,
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

