import { MahasiswaRepository, UpdateProfileData } from '@/repositories/mahasiswa.repository';

export class MahasiswaService {
  constructor(private mahasiswaRepo: MahasiswaRepository) {}

  /**
   * Get mahasiswa profile data
   */
  async getMahasiswaProfile(userId: string) {
    const profile = await this.mahasiswaRepo.getMahasiswaProfile(userId);
    
    if (!profile) {
      throw new Error('Student profile not found');
    }

    return {
      id: profile.id,
      name: profile.name,
      nim: profile.nim,
      email: profile.email,
      prodi: profile.prodi || '',
      fakultas: profile.fakultas || '',
      angkatan: profile.angkatan || '',
      semester: profile.semester || 0,
      phone: profile.phone || '',
    };
  }

  /**
   * Get complete internship data including student, submission, internship, mentor, and lecturer info
   */
  async getInternshipData(userId: string) {
    const data = await this.mahasiswaRepo.getInternshipData(userId);
    
    if (!data || !data.submissionId) {
      throw new Error('No active internship found for this student');
    }

    return {
      student: {
        id: data.studentId,
        name: data.studentName,
        nim: data.nim,
        email: data.email,
        prodi: data.prodi || '',
        fakultas: data.fakultas || '',
        angkatan: data.angkatan || '',
        semester: data.semester || 0,
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
      mentor: data.pembimbingLapanganId && data.mentorUserData ? {
        id: data.pembimbingLapanganId,
        name: data.mentorUserData.nama || '',
        email: data.mentorUserData.email || '',
        company: data.mentorCompany || '',
        position: data.mentorPosition || '',
        phone: data.mentorUserData.phone || '',
        signature: data.mentorSignature || null,
      } : null,
      lecturer: data.dosenPembimbingId && data.lecturerUserData ? {
        id: data.dosenPembimbingId,
        name: data.lecturerUserData.nama || '',
        email: data.lecturerUserData.email || '',
        nip: data.lecturerNip || '',
        phone: data.lecturerUserData.phone || '',
        jabatan: data.lecturerJabatan || '',
      } : null,
    };
  }

  /**
   * Update mahasiswa profile data (nama, phone, prodi, etc.)
   */
  async updateProfile(userId: string, data: UpdateProfileData) {
    const updated = await this.mahasiswaRepo.updateProfile(userId, data);
    if (!updated) {
      throw new Error('Student profile not found');
    }
    return {
      id: updated.id,
      name: updated.name,
      nim: updated.nim,
      email: updated.email,
      prodi: updated.prodi || '',
      fakultas: updated.fakultas || '',
      angkatan: updated.angkatan || '',
      semester: updated.semester || 0,
      phone: updated.phone || '',
    };
  }
}
