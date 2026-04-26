import { z } from 'zod';

export const requestSuratPermohonanSchema = z.object({
  memberMahasiswaId: z.string().min(1),
});

export const approveBulkSchema = z.object({
  requestIds: z.array(z.string().min(1)).min(1),
});

export const rejectRequestSchema = z.object({
  rejection_reason: z.string().min(1, 'Alasan penolakan wajib diisi.').max(1000),
});

export const reapplyRequestSchema = z.object({
  memberMahasiswaId: z.string().min(1),
});
