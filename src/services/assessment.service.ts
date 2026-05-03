import { createDbClient } from '@/db';
import { assessments, lecturerAssessments, combinedGrades, internships, mentors } from '@/db/schema';
import { eq } from 'drizzle-orm';
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

    // 4. Save Combined Grade
    const id = generateId();
    await this.db.insert(combinedGrades).values({
      id,
      internshipId,
      assessmentId: mentorAssessment?.id || null,
      lecturerAssessmentId,
      fieldScore,
      academicScore,
      finalScore,
      letterGrade,
      status: 'APPROVED',
      calculatedAt: new Date(),
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
  async getAssessmentRecap(internshipId: string) {
    const [combined, mentorScore, lecturerScore] = await Promise.all([
      this.db.select().from(combinedGrades).where(eq(combinedGrades.internshipId, internshipId)).limit(1),
      this.db.select().from(assessments).where(eq(assessments.internshipId, internshipId)).limit(1),
      this.db.select().from(lecturerAssessments).where(eq(lecturerAssessments.internshipId, internshipId)).limit(1),
    ]);

    return {
      combined: combined[0] || null,
      mentor: mentorScore[0] || null,
      lecturer: lecturerScore[0] || null,
    };
  }

  /**
   * Generate PDF for Grade Recap
   */
  async generateGradeRecapPDF(internshipId: string, sessionId: string) {
    // 1. Fetch data from DB
    const result = await this.db
      .select({
        internship: internships,
        mentor: mentors,
        combined: combinedGrades,
        mentorScore: assessments,
        lecturerScore: lecturerAssessments,
      })
      .from(internships)
      .leftJoin(mentors, eq(internships.pembimbingLapanganId, mentors.id))
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
