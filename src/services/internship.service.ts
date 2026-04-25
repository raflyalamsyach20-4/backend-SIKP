import { MahasiswaRepository } from '@/repositories/mahasiswa.repository';
import { UserRepository } from '@/repositories/user.repository';

export class InternshipService {
  constructor(
    private mahasiswaRepo: MahasiswaRepository,
    private userRepo: UserRepository
  ) {}

  /**
   * Get complete internship data including student, submission, internship, mentor, and lecturer info
   */
  async getInternshipData(userId: string) {
    const data = await this.mahasiswaRepo.getInternshipData(userId);
    
    if (!data || !data.submissionId) {
      throw new Error('No active internship found for this student. Please complete your submission first.');
    }

    // Resolve Student Details
    const studentProfile = await this.userRepo.getMahasiswaMe(userId);

    // Resolve Mentor Details
    let mentor = null;
    if (data.pembimbingLapanganId) {
      const mentorUser = await this.userRepo.findById(data.pembimbingLapanganId);
      mentor = {
        id: data.pembimbingLapanganId,
        name: mentorUser.nama || '',
        email: mentorUser.email || '',
        company: data.company || '', // Company info comes from internship table
        position: '', // Position might need another lookup or we store it in internships
        phone: mentorUser.phone || '',
        signature: null,
      };
    }

    // Resolve Lecturer Details
    let lecturer = null;
    if (data.dosenPembimbingId) {
      const lecturerProfile = await this.userRepo.getDosenMe(data.dosenPembimbingId);
      lecturer = {
        id: data.dosenPembimbingId,
        name: lecturerProfile.nama || '',
        email: lecturerProfile.email || '',
        nip: lecturerProfile.nip || '',
        phone: lecturerProfile.phone || '',
        jabatan: lecturerProfile.jabatan || '',
      };
    }

    return {
      student: {
        id: studentProfile.id,
        name: studentProfile.nama,
        nim: studentProfile.nim,
        email: studentProfile.email,
        prodi: studentProfile.prodi || '',
        fakultas: studentProfile.fakultas || '',
        angkatan: studentProfile.angkatan || '',
        semester: studentProfile.semester || 0,
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

