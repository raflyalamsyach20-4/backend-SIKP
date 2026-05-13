import { createDbClient } from '@/db';
import { assessments, lecturerAssessments, combinedGrades, internships, mentorSignatures, assessmentCriteria } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { generateId } from '@/utils/helpers';
import { MahasiswaService } from './mahasiswa.service';
import { DosenService } from './dosen.service';

export class AssessmentService {
  private db: ReturnType<typeof createDbClient>;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.dosenService = new DosenService(this.env);
  }

  /**
   * Calculate and save combined grade (30% Mentor + 70% Lecturer)
   */
  async calculateCombinedGrade(internshipId: string, lecturerAssessmentId: string, academicScore: number) {
    // 1. Get Mentor Assessment
    const mentorAssessmentResult = await this.db
      .select()
      .from(assessments)
      .where(eq(assessments.internshipId, internshipId))
      .limit(1);
    
    const mentorAssessment = mentorAssessmentResult[0];
    const fieldScore = mentorAssessment ? mentorAssessment.totalScore : 0;

    // 2. Calculation: 30% Mentor + 70% Dosen
    const finalScore = Math.round((fieldScore * 0.3) + (academicScore * 0.7));

    // 3. Determine Letter Grade
    let letterGrade = 'E';
    if (finalScore >= 80) letterGrade = 'A';
    else if (finalScore >= 70) letterGrade = 'B';
    else if (finalScore >= 60) letterGrade = 'C';
    else if (finalScore >= 50) letterGrade = 'D';

    // 4. Save Combined Grade (Upsert based on internshipId)
    await this.db
      .insert(combinedGrades)
      .values({
        id: generateId(),
        internshipId,
        assessmentId: mentorAssessment?.id || null,
        lecturerAssessmentId,
        fieldScore,
        academicScore,
        finalScore,
        letterGrade,
        status: 'APPROVED',
        calculatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: combinedGrades.internshipId,
        set: {
          assessmentId: mentorAssessment?.id || null,
          lecturerAssessmentId,
          fieldScore,
          academicScore,
          finalScore,
          letterGrade,
          status: 'APPROVED',
          calculatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    // 5. Mark Internship as SELESAI
    await this.db.update(internships)
      .set({ status: 'SELESAI', updatedAt: new Date() })
      .where(eq(internships.id, internshipId));

    return { finalScore, letterGrade };
  }

  /**
   * Get full assessment recap for an internship
   */
  async getAssessmentRecap(internshipId: string, sessionId?: string) {
    const [combined, mentorScore, lecturerScore, internshipRows] = await Promise.all([
      this.db.select().from(combinedGrades).where(eq(combinedGrades.internshipId, internshipId)).limit(1),
      this.db.select().from(assessments).where(eq(assessments.internshipId, internshipId)).limit(1),
      this.db.select().from(lecturerAssessments).where(eq(lecturerAssessments.internshipId, internshipId)).limit(1),
      this.db.select().from(internships).where(eq(internships.id, internshipId)).limit(1),
    ]);

    const internship = internshipRows[0] || null;
    let studentProfile: Awaited<ReturnType<MahasiswaService['getMahasiswaById']>> | null = null;
    let dosenProfile: Awaited<ReturnType<DosenService['getDosenById']>> | null = null;

    if (internship?.mahasiswaId && sessionId) {
      studentProfile = await this.mahasiswaService.getMahasiswaById(internship.mahasiswaId, sessionId);
    }

    if (internship?.dosenPembimbingId && sessionId) {
      dosenProfile = await this.dosenService.getDosenById(internship.dosenPembimbingId, sessionId);
    }

    return {
      student: internship
        ? {
            id: internship.mahasiswaId,
            name: studentProfile?.profile.fullName || '-',
            nim: studentProfile?.nim || '-',
            photo: null,
          }
        : null,
      companyName: internship?.companyName || null,
      startDate: internship?.startDate || null,
      endDate: internship?.endDate || null,
      mentorName: null,
      lecturerName: dosenProfile?.profile.fullName || null,
      mentor: mentorScore[0] || null,
      lecturer: lecturerScore[0] || null,
      combined: combined[0] || null,
    };
  }

  async getCriteria(type: 'MENTOR' | 'DOSEN_PA') {
    return this.db
      .select()
      .from(assessmentCriteria)
      .where(eq(assessmentCriteria.type, type))
      .orderBy(asc(assessmentCriteria.sortOrder), asc(assessmentCriteria.label));
  }

  async replaceCriteria(
    type: 'MENTOR' | 'DOSEN_PA',
    criteria: Array<{
      id?: string;
      categoryId?: string;
      category?: string;
      label?: string;
      description?: string;
      weight?: number;
      maxScore?: number;
      sortOrder?: number;
      isActive?: boolean;
    }>,
  ) {
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx.delete(assessmentCriteria).where(eq(assessmentCriteria.type, type));

      if (criteria.length === 0) {
        return;
      }

      const values = criteria.map((item, index) => {
        const id = item.categoryId || item.id || generateId();
        const label = item.label || item.category || 'Kategori';
        const categoryKey = item.category || label.toLowerCase().replace(/\s+/g, '_');

        return {
          id,
          type,
          categoryId: item.categoryId || item.id || id,
          categoryKey,
          label,
          description: item.description || null,
          weight: Number(item.weight) || 0,
          maxScore: Number(item.maxScore) || 100,
          sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index + 1,
          isActive: typeof item.isActive === 'boolean' ? item.isActive : true,
          createdAt: now,
          updatedAt: now,
        };
      });

      await tx.insert(assessmentCriteria).values(values);
    });
  }

  /**
   * Generate PDF for Grade Recap
   */
  async generateGradeRecapPDF(internshipId: string, sessionId: string) {
    // 1. Fetch data from DB
    const result = await this.db
      .select({
        internship: internships,
        mentorSignature: mentorSignatures,
        combined: combinedGrades,
        mentorScore: assessments,
        lecturerScore: lecturerAssessments,
      })
      .from(internships)
      .leftJoin(mentorSignatures, eq(internships.pembimbingLapanganId, mentorSignatures.id))
      .leftJoin(combinedGrades, eq(internships.id, combinedGrades.internshipId))
      .leftJoin(assessments, eq(internships.id, assessments.internshipId))
      .leftJoin(lecturerAssessments, eq(internships.id, lecturerAssessments.internshipId))
      .where(eq(internships.id, internshipId))
      .limit(1);

    if (result.length === 0) throw new Error('Data magang tidak ditemukan');
    const data = result[0];

    // 2. Fetch Profile Data from SSO
    const studentSso = await this.mahasiswaService.getMahasiswaById(data.internship.mahasiswaId, sessionId);
    const dosenSso = data.internship.dosenPembimbingId 
      ? await this.dosenService.getDosenById(data.internship.dosenPembimbingId, sessionId) 
      : null;
    
    // Fetch Mentor Profile from SSO
    let mentorSso: any = null;
    if (data.internship.pembimbingLapanganId) {
      try {
        const authService = new (await import('./auth.service')).AuthService(this.env);
        const token = await authService.getSessionAccessToken(sessionId);
        const response = await fetch(`${this.env.SSO_BASE_URL}/mentor/${data.internship.pembimbingLapanganId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const payload = await response.json() as { success: boolean; data: any };
          mentorSso = payload.data;
        }
      } catch (err) {
        console.warn('[AssessmentService] Failed to fetch mentor profile from SSO:', err);
      }
    }

    // 3. Generate PDF
    const PDFDocument = (await import('pdfkit')).default;
    
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.font('Helvetica-Bold').fontSize(14).text('REKAPITULASI NILAI AKHIR KERJA PRAKTIK', { align: 'center' });
      doc.moveDown();

      // Info
      doc.fontSize(10).font('Helvetica');
      doc.text(`Nama Mahasiswa : ${studentSso?.profile.fullName || 'N/A'}`);
      doc.text(`NIM            : ${studentSso?.nim || 'N/A'}`);
      doc.text(`Instansi       : ${data.internship.companyName}`);
      doc.moveDown();

      // Mentor Score Section
      doc.font('Helvetica-Bold').text('A. Penilaian Pembimbing Lapangan (Bobot 30%)');
      doc.font('Helvetica');
      if (data.mentorScore) {
        doc.text(`   - Kehadiran      : ${data.mentorScore.kehadiran}`);
        doc.text(`   - Kerjasama      : ${data.mentorScore.kerjasama}`);
        doc.text(`   - Sikap & Etika  : ${data.mentorScore.sikapEtika}`);
        doc.text(`   - Prestasi Kerja : ${data.mentorScore.prestasiKerja}`);
        doc.text(`   - Kreatifitas    : ${data.mentorScore.kreatifitas}`);
        doc.text(`   Rata-rata Skor Lapangan: ${data.mentorScore.totalScore}`);
      } else {
        doc.text('   (Belum dinilai)');
      }
      doc.moveDown();

      // Lecturer Score Section
      doc.font('Helvetica-Bold').text('B. Penilaian Dosen Pembimbing (Bobot 70%)');
      doc.font('Helvetica');
      if (data.lecturerScore) {
        doc.text(`   - Format & Kesesuaian  : ${data.lecturerScore.formatKesesuaian}`);
        doc.text(`   - Penguasaan Materi    : ${data.lecturerScore.penguasaanMateri}`);
        doc.text(`   - Analisis Perancangan : ${data.lecturerScore.analisisPerancangan}`);
        doc.text(`   - Sikap & Etika        : ${data.lecturerScore.sikapEtika}`);
        doc.text(`   Rata-rata Skor Akademik: ${data.lecturerScore.totalScore}`);
      } else {
        doc.text('   (Belum dinilai)');
      }
      doc.moveDown();

      // Final Grade Section
      doc.rect(50, doc.y, 500, 60).stroke();
      const finalY = doc.y + 15;
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(`NILAI AKHIR GABUNGAN: ${data.combined?.finalScore || '-'}`, 70, finalY);
      doc.text(`GRADE: ${data.combined?.letterGrade || '-'}`, 350, finalY);
      
      doc.moveDown(4);

      // Signatures
      const sigY = doc.y;
      doc.fontSize(10).font('Helvetica');
      doc.text('Mengetahui,', 50, sigY);
      doc.text('Dosen Pembimbing,', 400, sigY);
      doc.moveDown(4);
      doc.text('Koordinator KP', 50, doc.y);
      doc.text(dosenSso?.profile.fullName || '(....................)', 400, doc.y);

      doc.end();
    });
  }
}
