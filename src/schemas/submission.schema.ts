import { z } from 'zod';

export const createSubmissionSchema = z.object({
  teamId: z.string().min(1),
  letterPurpose: z.string().min(1).optional(),
  companyName: z.string().min(1).optional(),
  companyAddress: z.string().min(1).optional(),
  companyPhone: z.string().max(50).optional(),
  companyBusinessType: z.string().max(255).optional(),
  division: z.string().min(1).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).refine((value) => {
  if (!value.companyPhone || value.companyPhone.trim() === '') {
    return true;
  }

  return /^[0-9+\-()\s]{6,50}$/.test(value.companyPhone.trim());
}, {
  message: 'companyPhone format is invalid',
  path: ['companyPhone'],
}).refine((value) => {
  if (!value.companyBusinessType || value.companyBusinessType.trim() === '') {
    return true;
  }

  const length = value.companyBusinessType.trim().length;
  return length >= 2 && length <= 255;
}, {
  message: 'companyBusinessType must be 2-255 characters when provided',
  path: ['companyBusinessType'],
});

export const updateSubmissionSchema = z.object({
  letterPurpose: z.string().optional(),
  companyName: z.string().optional(),
  companyAddress: z.string().optional(),
  companyPhone: z.string().max(50).optional(),
  companyBusinessType: z.string().max(255).optional(),
  division: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).refine((value) => {
  if (!value.companyPhone || value.companyPhone.trim() === '') {
    return true;
  }

  return /^[0-9+\-()\s]{6,50}$/.test(value.companyPhone.trim());
}, {
  message: 'companyPhone format is invalid',
  path: ['companyPhone'],
}).refine((value) => {
  if (!value.companyBusinessType || value.companyBusinessType.trim() === '') {
    return true;
  }

  const length = value.companyBusinessType.trim().length;
  return length >= 2 && length <= 255;
}, {
  message: 'companyBusinessType must be 2-255 characters when provided',
  path: ['companyBusinessType'],
});

export const uploadDocumentSchema = z.object({
  documentType: z.enum(['PROPOSAL_KETUA', 'SURAT_KESEDIAAN', 'FORM_PERMOHONAN', 'KRS_SEMESTER_4', 'DAFTAR_KUMPULAN_NILAI', 'BUKTI_PEMBAYARAN_UKT']),
  memberMahasiswaId: z.string().min(1),
});
