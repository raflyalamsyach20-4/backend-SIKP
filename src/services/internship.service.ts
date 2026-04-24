import { MahasiswaRepository } from '@/repositories/mahasiswa.repository';

export class InternshipService {
  constructor(private mahasiswaRepo: MahasiswaRepository) {}

  /**
   * Get complete internship data including student, submission, internship, mentor, and lecturer info
   */
  async getInternshipData(userId: string) {
    const data = await this.mahasiswaRepo.getInternshipData(userId);
    
    if (!data || !data.submissionId) {
      throw new Error('No active internship found for this student. Please complete your submission first.');
    }

    return {
      student: {
        id: data.studentId,
        name: data.studentName,
        nim: data.nim,
        email: data.email,
        prodi: '',
        fakultas: '',
        angkatan: '',
        semester: 0,
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
}
