import { eq, and } from 'drizzle-orm';
import type { DbClient } from '@/db';
import { 
  users, 
  mahasiswa, 
  internships, 
  submissions, 
  teams,
  teamMembers,
  pembimbingLapangan,
  dosen 
} from '@/db/schema';

export interface UpdateProfileData {
  nama?: string;
  phone?: string;
  prodi?: string;
  fakultas?: string;
  semester?: number;
  angkatan?: string;
}

export class MahasiswaRepository {
  constructor(private db: DbClient) {}

  /**
   * Get mahasiswa profile by user ID
   */
  async getMahasiswaProfile(userId: string) {
    const result = await this.db
      .select({
        id: users.id,
        name: users.nama,
        nim: mahasiswa.nim,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
      .where(eq(users.id, userId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get complete internship data (student + submission + internship + mentor + lecturer)
   * This joins multiple tables to get all necessary data
   */
  async getInternshipData(userId: string) {
    // First, get the main internship data
    const result = await this.db
      .select({
        // Student data
        studentId: users.id,
        studentName: users.nama,
        nim: mahasiswa.nim,
        email: users.email,
        
        // Submission data
        submissionId: submissions.id,
        teamId: submissions.teamId,
        company: submissions.companyName,
        companyAddress: submissions.companyAddress,
        division: submissions.division,
        submissionStartDate: submissions.startDate,
        submissionEndDate: submissions.endDate,
        submissionStatus: submissions.status,
        submittedAt: submissions.submittedAt,
        approvedAt: submissions.approvedAt,
        approvedBy: submissions.approvedBy,
        
        // Internship data
        internshipId: internships.id,
        internshipStatus: internships.status,
        pembimbingLapanganId: internships.pembimbingLapanganId,
        dosenPembimbingId: internships.dosenPembimbingId,
        internshipStartDate: internships.startDate,
        internshipEndDate: internships.endDate,
        internshipCreatedAt: internships.createdAt,
        internshipUpdatedAt: internships.updatedAt,
        
        // Pembimbing Lapangan (Mentor) basic data from pembimbingLapangan table
        mentorCompany: pembimbingLapangan.companyName,
        mentorPosition: pembimbingLapangan.position,
        mentorCompanyAddress: pembimbingLapangan.companyAddress,
        mentorSignature: pembimbingLapangan.signature,
        mentorSignatureSetAt: pembimbingLapangan.signatureSetAt,
        
        // Dosen Pembimbing (Lecturer) basic data from dosen table
        lecturerNip: dosen.nip,
        lecturerJabatan: dosen.jabatan,
        lecturerFakultas: dosen.fakultas,
        lecturerProdi: dosen.prodi,
      })
      .from(users)
      .innerJoin(mahasiswa, eq(users.id, mahasiswa.id))
      .innerJoin(teamMembers, eq(mahasiswa.nim, teamMembers.userId))
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .innerJoin(
        submissions, 
        and(
          eq(teams.id, submissions.teamId),
          eq(submissions.status, 'APPROVED')
        )
      )
      .leftJoin(
        internships, 
        and(
          eq(mahasiswa.nim, internships.mahasiswaId),
          eq(submissions.id, internships.submissionId)
        )
      )
      .leftJoin(
        pembimbingLapangan,
        eq(internships.pembimbingLapanganId, pembimbingLapangan.id)
      )
      .leftJoin(
        dosen,
        eq(internships.dosenPembimbingId, dosen.id)
      )
      .where(eq(users.id, userId))
      .limit(1);

    const mainData = result[0] || null;
    
    if (!mainData) {
      return null;
    }

    // If there's a mentor (pembimbing lapangan), get their user details
    let mentorUserData = null;
    if (mainData.pembimbingLapanganId) {
      const mentorUser = await this.db
        .select({
          id: users.id,
          nama: users.nama,
          email: users.email,
          phone: users.phone,
        })
        .from(users)
        .where(eq(users.id, mainData.pembimbingLapanganId))
        .limit(1);
      
      mentorUserData = mentorUser[0] || null;
    }

    // If there's a dosen pembimbing, get their user details
    let lecturerUserData = null;
    if (mainData.dosenPembimbingId) {
      const lecturerUser = await this.db
        .select({
          id: users.id,
          nama: users.nama,
          email: users.email,
          phone: users.phone,
        })
        .from(users)
        .where(eq(users.id, mainData.dosenPembimbingId))
        .limit(1);
      
      lecturerUserData = lecturerUser[0] || null;
    }

    return {
      ...mainData,
      mentorUserData,
      lecturerUserData,
    };
  }

  /**
   * Check if mahasiswa has an active internship
   */
  async hasActiveInternship(mahasiswaId: string) {
    const result = await this.db
      .select()
      .from(internships)
      .where(
        and(
          eq(internships.mahasiswaId, mahasiswaId),
          eq(internships.status, 'AKTIF')
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Get NIM of mahasiswa by userId
   */
  async getMahasiswaNimByUserId(userId: string): Promise<string | null> {
    const result = await this.db
      .select({ nim: mahasiswa.nim })
      .from(mahasiswa)
      .where(eq(mahasiswa.id, userId))
      .limit(1);
    return result[0]?.nim ?? null;
  }

  /**
   * Update mahasiswa profile (users + mahasiswa tables)
   */
  async updateProfile(userId: string, data: UpdateProfileData) {
    // Update users table fields
    const userFields: Record<string, any> = {};
    if (data.nama !== undefined) userFields.nama = data.nama;
    if (data.phone !== undefined) userFields.phone = data.phone;

    if (Object.keys(userFields).length > 0) {
      await this.db.update(users).set(userFields).where(eq(users.id, userId));
    }

    // Update mahasiswa table fields
    const mhsFields: Record<string, any> = {};
    if (data.prodi !== undefined) mhsFields.prodi = data.prodi;
    if (data.fakultas !== undefined) mhsFields.fakultas = data.fakultas;
    if (data.semester !== undefined) mhsFields.semester = data.semester;
    if (data.angkatan !== undefined) mhsFields.angkatan = data.angkatan;

    if (Object.keys(mhsFields).length > 0) {
      await this.db.update(mahasiswa).set(mhsFields).where(eq(mahasiswa.id, userId));
    }

    // Return updated profile
    return this.getMahasiswaProfile(userId);
  }
}
