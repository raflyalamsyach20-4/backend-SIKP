import { Context } from 'hono';
import { createResponse } from '@/utils/helpers';

/**
 * Hardcoded assessment criteria for the SIKP system.
 * These map directly to the columns in the `assessments` table.
 * Total weight = 100%.
 *
 * NOTE: Criteria weights are fixed in this implementation and not stored in the DB.
 * The PUT /api/admin/penilaian/kriteria endpoint validates and acknowledges updates
 * but changes are not persisted across restarts (stateless edge deployment).
 */
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
  /**
   * GET /api/penilaian/kriteria
   * Returns the assessment criteria with weights.
   */
  getKriteria = async (c: Context) => {
    return c.json(
      createResponse(true, 'Penilaian kriteria retrieved successfully', {
        kriteria: DEFAULT_KRITERIA,
        totalWeight: DEFAULT_KRITERIA.reduce((sum, k) => sum + k.weight, 0),
        note: 'Weights reflect the scoring formula: totalScore = Σ(score × weight/100)',
      }),
      200
    );
  };

  /**
   * PUT /api/admin/penilaian/kriteria
   * Validates and acknowledges criteria update.
   * NOTE: Changes are not persisted (no DB table for criteria in this deployment).
   */
  updateKriteria = async (c: Context) => {
    try {
      const body = await c.req.json();
      const { kriteria } = body;

      if (!Array.isArray(kriteria) || kriteria.length === 0) {
        return c.json(createResponse(false, "'kriteria' must be a non-empty array"), 400);
      }

      const totalWeight = kriteria.reduce((sum: number, k: any) => sum + (Number(k.weight) || 0), 0);
      if (totalWeight !== 100) {
        return c.json(
          createResponse(false, `Total weight must equal 100. Current total: ${totalWeight}`),
          400
        );
      }

      // Validate each entry has required fields
      for (const k of kriteria) {
        if (!k.category || k.weight === undefined || k.maxScore === undefined) {
          return c.json(
            createResponse(false, 'Each criterion must have: category, weight, maxScore'),
            400
          );
        }
      }

      // Since there's no DB table for criteria storage, acknowledge the update
      // and return the submitted criteria with a note.
      return c.json(
        createResponse(true, 'Criteria acknowledged (note: changes are not persisted in this version)', {
          kriteria,
          totalWeight,
        }),
        200
      );
    } catch (error) {
      return c.json(createResponse(false, 'Invalid request body'), 400);
    }
  };
}
