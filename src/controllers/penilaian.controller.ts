import { Context } from 'hono';
import { createResponse, handleError } from '@/utils/helpers';
import { AssessmentService } from '@/services/assessment.service';
import type { JWTPayload } from '@/types';

const DEFAULT_MENTOR_KRITERIA = [
  {
    id: 'kehadiran',
    category: 'kehadiran',
    label: 'Kehadiran',
    description: 'Tingkat kehadiran dan kedisiplinan mahasiswa selama KP',
    weight: 20,
    maxScore: 100,
  },
  {
    id: 'kerjasama',
    category: 'kerjasama',
    label: 'Kerjasama',
    description: 'Kemampuan bekerja sama dalam tim dan lingkungan kerja',
    weight: 30,
    maxScore: 100,
  },
  {
    id: 'sikap_etika',
    category: 'sikapEtika',
    label: 'Sikap & Etika',
    description: 'Sikap profesional dan etika kerja mahasiswa',
    weight: 20,
    maxScore: 100,
  },
  {
    id: 'prestasi_kerja',
    category: 'prestasiKerja',
    label: 'Prestasi Kerja',
    description: 'Kualitas dan hasil pekerjaan yang diselesaikan',
    weight: 20,
    maxScore: 100,
  },
  {
    id: 'kreatifitas',
    category: 'kreatifitas',
    label: 'Kreatifitas',
    description: 'Kreativitas dan inisiatif dalam menyelesaikan tugas',
    weight: 10,
    maxScore: 100,
  },
];

const DEFAULT_DOSEN_PA_KRITERIA = [
  {
    id: 'format_kesesuaian',
    category: 'formatKesesuaian',
    label: 'Kesesuaian Laporan dengan Format',
    description: 'Kesesuaian laporan dengan pedoman format yang berlaku',
    weight: 30,
    maxScore: 100,
  },
  {
    id: 'penguasaan_materi',
    category: 'penguasaanMateri',
    label: 'Penguasaan Materi KP',
    description: 'Kedalaman pemahaman mahasiswa terhadap topik magang',
    weight: 30,
    maxScore: 100,
  },
  {
    id: 'analisis_perancangan',
    category: 'analisisPerancangan',
    label: 'Analisis dan Perancangan',
    description: 'Kualitas analisis masalah dan solusi perancangan sistem',
    weight: 30,
    maxScore: 100,
  },
  {
    id: 'sikap_etika_pa',
    category: 'sikapEtika',
    label: 'Sikap dan Etika',
    description: 'Etika dalam penulisan dan kejujuran akademik',
    weight: 10,
    maxScore: 100,
  },
];

export class PenilaianController {
  private assessmentService: AssessmentService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.assessmentService = new AssessmentService(this.c.env);
  }

  /**
   * GET /api/penilaian/kriteria
   */
  getKriteria = async () => {
    try {
      const type = (this.c.req.query('type') || 'MENTOR') as 'MENTOR' | 'DOSEN_PA';
      const kriteria = type === 'DOSEN_PA' ? DEFAULT_DOSEN_PA_KRITERIA : DEFAULT_MENTOR_KRITERIA;
      const stored = await this.assessmentService.getCriteria(type);

      if (stored.length > 0) {
        const mapped = stored.map((item) => ({
          id: item.id,
          categoryId: item.categoryId || item.id,
          categoryKey: item.categoryKey || item.label,
          category: item.label,
          label: item.label,
          description: item.description || '-',
          weight: item.weight,
          maxScore: item.maxScore,
          sortOrder: item.sortOrder,
          isActive: item.isActive,
        }));

        return this.c.json(
          createResponse(true, `Penilaian kriteria (${type}) retrieved successfully`, {
            kriteria: mapped,
            totalWeight: mapped.reduce((sum: number, k: any) => sum + k.weight, 0),
            note: 'Weights reflect the scoring formula: totalScore = Σ(score × weight/100)',
          }),
          200
        );
      }

      return this.c.json(
        createResponse(true, `Penilaian kriteria (${type}) retrieved successfully`, {
          kriteria: kriteria,
          totalWeight: kriteria.reduce((sum: number, k: any) => sum + k.weight, 0),
          note: 'Weights reflect the scoring formula: totalScore = Σ(score × weight/100)',
        }),
        200
      );
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/penilaian/recap/:internshipId
   */
  getRecap = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const sessionId = user.sessionId;
      const internshipId = this.c.req.param('internshipId');
      const data = await this.assessmentService.getAssessmentRecap(internshipId, sessionId);
      return this.c.json(createResponse(true, 'Assessment recap retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/penilaian/print/:internshipId
   */
  printRecap = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const sessionId = user.sessionId!;
      const internshipId = this.c.req.param('internshipId');
      const buffer = await this.assessmentService.generateGradeRecapPDF(internshipId, sessionId);

      this.c.header('Content-Type', 'application/pdf');
      this.c.header('Content-Disposition', `attachment; filename="Rekap-Nilai-${internshipId}.pdf"`);
      
      return this.c.body(buffer as any);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * PUT /api/admin/penilaian/kriteria (Acknowledge only)
   */
  updateKriteria = async () => {
    try {
      const type = (this.c.req.query('type') || 'MENTOR') as 'MENTOR' | 'DOSEN_PA';
      if (type !== 'MENTOR' && type !== 'DOSEN_PA') {
        return this.c.json(createResponse(false, 'Invalid criteria type'), 400);
      }

      const body = await this.c.req.json();
      const { kriteria } = body;

      if (!Array.isArray(kriteria) || kriteria.length === 0) {
        return this.c.json(createResponse(false, "'kriteria' must be a non-empty array"), 400);
      }

      const totalWeight = kriteria.reduce((sum: number, k: any) => sum + (Number(k.weight) || 0), 0);
      if (totalWeight !== 100) {
        return this.c.json(createResponse(false, `Total weight must equal 100. Current total: ${totalWeight}`), 400);
      }

      await this.assessmentService.replaceCriteria(type, kriteria);

      return this.c.json(createResponse(true, 'Criteria updated', { kriteria, totalWeight, type }), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/penilaian/kaprodi/pending
   */
  getPendingVerifications = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const profileId = user.profileId;
      const sessionId = user.sessionId!;
      
      if (!profileId) {
        return this.c.json(createResponse(false, 'Profile ID not found in token'), 401);
      }

      const prodiName = typeof user.prodi === 'string' ? user.prodi : null;
      const data = await this.assessmentService.getPendingVerifications(profileId, sessionId, prodiName);
      return this.c.json(createResponse(true, 'Pending verifications retrieved', data), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/penilaian/kaprodi/verify/:gradeId
   */
  verifyGrade = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const profileId = user.profileId;
      const gradeId = this.c.req.param('gradeId');

      if (!profileId || !gradeId) {
        return this.c.json(createResponse(false, 'Missing profileId or gradeId'), 400);
      }

      const result = await this.assessmentService.verifyGrade(gradeId, profileId);
      return this.c.json(createResponse(true, 'Grade verified successfully', result), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * GET /api/penilaian/admin/pending
   */
  getAdminPendingVerifications = async () => {
    try {
      const sessionId = this.c.get('sessionId') as string;
      const results = await this.assessmentService.getPendingAdminVerifications(sessionId);
      return this.c.json(createResponse(true, 'Pending admin verifications retrieved', results), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };

  /**
   * POST /api/penilaian/admin/verify/:gradeId
   */
  verifyGradeByAdmin = async () => {
    try {
      const gradeId = this.c.req.param('gradeId');
      const result = await this.assessmentService.verifyGradeByAdmin(gradeId);
      return this.c.json(createResponse(true, 'Grade verified by admin successfully', result), 200);
    } catch (error) {
      return handleError(this.c, error);
    }
  };
}
