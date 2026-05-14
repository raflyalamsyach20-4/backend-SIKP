import { createDbClient } from '@/db';
import { assessments, lecturerAssessments, combinedGrades, internships, mentorSignatures, assessmentCriteria } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { generateId } from '@/utils/helpers';
import { MahasiswaService } from './mahasiswa.service';
import { DosenService } from './dosen.service';
import { MentorService } from './mentor.service';
import { programStudies } from '@/db/schema';
import { StorageService } from './storage.service';
import { SsoSignatureProxyService } from './sso-signature-proxy.service';

export class AssessmentService {
  private db: ReturnType<typeof createDbClient>;
  private mahasiswaService: MahasiswaService;
  private dosenService: DosenService;
  private storageService: StorageService;
  private ssoSignatureProxyService: SsoSignatureProxyService;

  constructor(private env: CloudflareBindings) {
    this.db = createDbClient(this.env.DATABASE_URL);
    this.mahasiswaService = new MahasiswaService(this.env);
    this.dosenService = new DosenService(this.env);
    this.storageService = new StorageService(this.env);
    this.ssoSignatureProxyService = new SsoSignatureProxyService(this.env);
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
        status: 'PENDING',
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
          status: 'PENDING',
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
      
      // Auto-sync lecturer signature from SSO
      try {
        const mentorService = new MentorService(this.env);
        await mentorService.syncSignatureFromSso(internship.dosenPembimbingId, sessionId);
      } catch (err) {
        console.warn('[AssessmentService] Failed to auto-sync lecturer signature:', err);
      }
    }

    // Auto-sync Coordinator signature if possible
    if (studentProfile?.prodi?.nama && sessionId) {
       try {
         const [prodi] = await this.db
           .select()
           .from(programStudies)
           .where(eq(programStudies.nama, studentProfile.prodi.nama))
           .limit(1);
         
         if (prodi?.coordinatorId) {
            const mentorService = new MentorService(this.env);
            await mentorService.syncSignatureFromSso(prodi.coordinatorId, sessionId);
         }
       } catch (err) {
         console.warn('[AssessmentService] Failed to auto-sync coordinator signature:', err);
       }
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

    // 2. Fetch Lecturer and Coordinator signatures
    let lecturerSigBuffer: Buffer | null = null;
    let coordinatorSigBuffer: Buffer | null = null;
    let coordinatorName = '(....................)';
    let coordinatorNip = '';

    try {
      // 1. Lecturer Signature (Dosen Pembimbing)
      // First try local DB signatures table
      if (data.internship.dosenPembimbingId) {
        const [sigRecord] = await this.db.select().from(mentorSignatures).where(eq(mentorSignatures.id, data.internship.dosenPembimbingId)).limit(1);
        if (sigRecord?.signatureUrl) {
          lecturerSigBuffer = await this.resolveSignatureBuffer(sigRecord.signatureUrl);
        }
      }

      // 2. Coordinator Signature (Kaprodi)
      // Since Kaprodi is likely the one printing this, try their active session signature first
      const activeSig = await this.ssoSignatureProxyService.getActiveSignature(sessionId);
      if (activeSig) {
        const asAny = activeSig as any;
        let ssoUrl = asAny.signatureImage || asAny.svg || asAny.signatureUrl;
        
        if (ssoUrl && typeof ssoUrl === 'string' && ssoUrl.trim().startsWith('<svg')) {
          const encoded = Buffer.from(ssoUrl).toString('base64');
          ssoUrl = `data:image/svg+xml;base64,${encoded}`;
        }

        if (ssoUrl) {
          coordinatorSigBuffer = await this.resolveSignatureBuffer(ssoUrl);
        }
      }
      
      // Fallback for Coordinator: check DB if not found in session
      if (!coordinatorSigBuffer) {
        const [prodi] = await this.db
          .select()
          .from(programStudies)
          .where(eq(programStudies.nama, studentSso?.prodi?.nama || ''))
          .limit(1);

        if (prodi?.coordinatorId) {
          const [sigRecord] = await this.db.select().from(mentorSignatures).where(eq(mentorSignatures.id, prodi.coordinatorId)).limit(1);
          if (sigRecord?.signatureUrl) {
            coordinatorSigBuffer = await this.resolveSignatureBuffer(sigRecord.signatureUrl);
          }
          
          const coordProfile = await this.dosenService.getDosenById(prodi.coordinatorId, sessionId);
          if (coordProfile) {
            coordinatorName = coordProfile.profile.fullName;
            coordinatorNip = coordProfile.nip || (coordProfile as any).nidn || '';
          }
        }
      }
    } catch (err) {
      console.warn('[AssessmentService] Failed to fetch signatures for PDF:', err);
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
      doc.moveDown(0.5);

      const sigImageY = doc.y;
      
      // Coordinator Signature (Left)
      if (coordinatorSigBuffer) {
        doc.image(coordinatorSigBuffer, 50, sigImageY, { height: 40 });
      }

      // Lecturer Signature (Right)
      if (lecturerSigBuffer) {
        doc.image(lecturerSigBuffer, 400, sigImageY, { height: 40 });
      }

      doc.moveDown(3);
      const nameY = doc.y;
      
      doc.font('Helvetica-Bold');
      doc.text('Koordinator Program Studi', 50, sigImageY);
      doc.text(coordinatorName, 50, nameY);
      doc.font('Helvetica').fontSize(9);
      if (coordinatorNip) doc.text(`NIP. ${coordinatorNip}`, 50, nameY + 12);
      
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text(dosenSso?.profile.fullName || '(....................)', 400, nameY);
      doc.font('Helvetica').fontSize(9);
      if ((dosenSso as any).nip) doc.text(`NIP. ${(dosenSso as any).nip}`, 400, nameY + 12);

      doc.end();
    });
  }

  /**
   * Get pending grade verifications for Kaprodi
   */
  async getPendingVerifications(coordinatorId: string, sessionId: string, tokenProdi?: string | null) {
    // 1. Resolve Kaprodi's Prodi
    let targetProdiNama = "";
    
    // Attempt A: Try database mapping
    const [prodiDb] = await this.db
      .select()
      .from(programStudies)
      .where(eq(programStudies.coordinatorId, coordinatorId))
      .limit(1);
    
    if (prodiDb) {
      targetProdiNama = prodiDb.nama;
      console.info(`[AssessmentService] Resolved prodi from DB: ${targetProdiNama}`);
    } else if (tokenProdi) {
      // Attempt B: Fallback to JWT Token info
      targetProdiNama = tokenProdi;
      console.info(`[AssessmentService] Resolved prodi from JWT Token: ${targetProdiNama}`);
    } else {
      // Attempt C: Fallback to SSO Profile (Slowest)
      console.info(`[AssessmentService] Attempting SSO profile resolution for ${coordinatorId}`);
      const dosenProfile = await this.dosenService.getDosenById(coordinatorId, sessionId);
      const rawProdi = dosenProfile?.prodi;
      if (typeof rawProdi === 'string') {
        targetProdiNama = rawProdi;
      } else if (rawProdi?.nama) {
        targetProdiNama = rawProdi.nama;
      }
      
      if (targetProdiNama) {
        console.info(`[AssessmentService] Resolved prodi from SSO/Snapshot: ${targetProdiNama}`);
      }
    }
    
    if (!targetProdiNama) {
      console.warn(`[AssessmentService] Could not resolve prodi for Kaprodi ${coordinatorId}`);
      return [];
    }

    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const normalizedTarget = normalize(targetProdiNama);

    // 2. Fetch all combined grades that might belong to this prodi

    const results = await this.db
      .select({
        id: combinedGrades.id,
        internshipId: combinedGrades.internshipId,
        finalScore: combinedGrades.finalScore,
        academicScore: combinedGrades.academicScore,
        fieldScore: combinedGrades.fieldScore,
        letterGrade: combinedGrades.letterGrade,
        calculatedAt: combinedGrades.calculatedAt,
        isVerified: combinedGrades.isVerifiedByKaprodi,
        studentId: internships.mahasiswaId,
        companyName: internships.companyName,
      })
      .from(combinedGrades)
      .innerJoin(internships, eq(combinedGrades.internshipId, internships.id));
    
    const enrichedResults = await Promise.all(results.map(async (item) => {
      const studentProfile = await this.mahasiswaService.getMahasiswaById(item.studentId, sessionId);
      
      // Robust prodi name extraction
      let studentProdiRaw = "";
      if (typeof studentProfile?.prodi === "string") {
        studentProdiRaw = studentProfile.prodi;
      } else if (studentProfile?.prodi?.nama) {
        studentProdiRaw = studentProfile.prodi.nama;
      }
      
      const studentProdi = normalize(studentProdiRaw);
      
      // Fuzzy match: check if target prodi name is contained in student prodi name or vice-versa
      const isMatch = studentProdi === normalizedTarget || 
                      studentProdi.includes(normalizedTarget) || 
                      normalizedTarget.includes(studentProdi);

      if (!isMatch) return null;

      return {
        ...item,
        studentName: studentProfile?.profile.fullName || '-',
        nim: studentProfile?.nim || '-',
      };
    }));

    const finalResults = enrichedResults.filter((r): r is NonNullable<typeof r> => r !== null);
    console.info(`[AssessmentService] getPendingVerifications returning ${finalResults.length} students for prodi ${targetProdiNama}`);
    return finalResults;
  }

  /**
   * Verify grade by Kaprodi
   */
  async verifyGrade(gradeId: string, coordinatorId: string) {
    await this.db
      .update(combinedGrades)
      .set({
        isVerifiedByKaprodi: true,
        verifiedAt: new Date(),
        verifiedByKaprodiId: coordinatorId,
        status: 'APPROVED',
        updatedAt: new Date(),
      })
      .where(eq(combinedGrades.id, gradeId));
    
    return { success: true };
  }

  /**
   * Get pending grade verifications for Admin (Combined Grades)
   */
  async getPendingAdminVerifications(sessionId: string) {
    const results = await this.db
      .select({
        id: combinedGrades.id,
        internshipId: combinedGrades.internshipId,
        finalScore: combinedGrades.finalScore,
        letterGrade: combinedGrades.letterGrade,
        calculatedAt: combinedGrades.calculatedAt,
        status: combinedGrades.status,
        isVerifiedByKaprodi: combinedGrades.isVerifiedByKaprodi,
        studentId: internships.mahasiswaId,
        companyName: internships.companyName,
      })
      .from(combinedGrades)
      .innerJoin(internships, eq(combinedGrades.internshipId, internships.id))
      .where(eq(combinedGrades.status, 'PENDING'));
    
    const enrichedResults = await Promise.all(results.map(async (item) => {
      const studentProfile = await this.mahasiswaService.getMahasiswaById(item.studentId, sessionId);
      
      return {
        ...item,
        studentName: studentProfile?.profile.fullName || '-',
        nim: studentProfile?.nim || '-',
        prodi: studentProfile?.prodi?.nama || '-',
      };
    }));

    return enrichedResults;
  }

  /**
   * Verify grade by Admin
   */
  async verifyGradeByAdmin(gradeId: string) {
    return await this.db
      .update(combinedGrades)
      .set({
        isVerifiedByKaprodi: true, // Admin can bypass
        status: 'APPROVED',
        updatedAt: new Date(),
      })
      .where(eq(combinedGrades.id, gradeId))
      .returning();
  }

  /**
   * Helper to resolve signature URL (could be R2 key, full URL, or data URL) to Buffer
   */
  private async resolveSignatureBuffer(urlOrKey: string): Promise<Buffer | null> {
    try {
      // 1. Data URL (Base64)
      if (urlOrKey.startsWith('data:')) {
        const base64 = urlOrKey.split(',')[1];
        return Buffer.from(base64, 'base64');
      }

      // 2. SVG String (Need to wrap in data URL first? No, pdfkit needs image)
      // Actually, if it's raw SVG, we have a problem. 
      // But MentorService converts SVG to data URL.
      
      // 3. R2 Key or Full URL
      if (urlOrKey.startsWith('http')) {
        const resp = await fetch(urlOrKey);
        if (resp.ok) return Buffer.from(await resp.arrayBuffer());
      } else {
        const file = await this.storageService.getFile(urlOrKey.startsWith('signatures/') ? urlOrKey : `signatures/${urlOrKey}`);
        if (file) return Buffer.from(await file.arrayBuffer());
      }
    } catch (err) {
      console.warn('[AssessmentService.resolveSignatureBuffer] Failed:', err);
    }
    return null;
  }
}
