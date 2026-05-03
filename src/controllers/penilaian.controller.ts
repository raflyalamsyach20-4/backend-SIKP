import { Context } from 'hono';
import { createResponse, handleError } from '@/utils/helpers';
import { AssessmentService } from '@/services/assessment.service';
import type { JWTPayload } from '@/types';

const DEFAULT_KRITERIA = [
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

export class PenilaianController {
  private assessmentService: AssessmentService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.assessmentService = new AssessmentService(this.c.env);
  }

  /**
   * GET /api/penilaian/kriteria
   */
  getKriteria = async () => {
    return this.c.json(
      createResponse(true, 'Penilaian kriteria retrieved successfully', {
        kriteria: DEFAULT_KRITERIA,
        totalWeight: DEFAULT_KRITERIA.reduce((sum, k) => sum + k.weight, 0),
        note: 'Weights reflect the scoring formula: totalScore = Σ(score × weight/100)',
      }),
      200
    );
  };

  /**
   * GET /api/penilaian/recap/:internshipId
   */
  getRecap = async () => {
    try {
      const internshipId = this.c.req.param('internshipId');
      const data = await this.assessmentService.getAssessmentRecap(internshipId);
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
      const body = await this.c.req.json();
      const { kriteria } = body;

      if (!Array.isArray(kriteria) || kriteria.length === 0) {
        return this.c.json(createResponse(false, "'kriteria' must be a non-empty array"), 400);
      }

      const totalWeight = kriteria.reduce((sum: number, k: any) => sum + (Number(k.weight) || 0), 0);
      if (totalWeight !== 100) {
        return this.c.json(createResponse(false, `Total weight must equal 100. Current total: ${totalWeight}`), 400);
      }

      return this.c.json(createResponse(true, 'Criteria acknowledged', { kriteria, totalWeight }), 200);
    } catch (error) {
      return this.c.json(createResponse(false, 'Invalid request body'), 400);
    }
  };
}
