import { z } from 'zod';

export const createLogbookSchema = z.object({
  date: z.string().min(1, 'Tanggal harus diisi'),
  activity: z.string().min(1, 'Aktivitas harus diisi'),
  description: z.string().min(1, 'Deskripsi harus diisi'),
  hours: z.number().optional(),
});

export const updateLogbookSchema = z.object({
  date: z.string().optional(),
  activity: z.string().optional(),
  description: z.string().optional(),
  hours: z.number().optional(),
});

export const submitMentorApprovalRequestSchema = z.object({
  mentorName: z.string().min(1, 'Nama mentor harus diisi'),
  mentorEmail: z.string().email('Email mentor tidak valid'),
  mentorPhone: z.string().optional(),
  companyName: z.string().optional(),
  position: z.string().optional(),
  companyAddress: z.string().optional(),
});

export const mentorProfileSchema = z.object({
  nama: z.string().min(1).optional(),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  position: z.string().optional(),
  companyAddress: z.string().optional(),
});

export const mentorSignatureSchema = z.object({
  signature: z.string().min(1, 'Data tanda tangan (Base64) diperlukan'),
});

export const rejectLogbookSchema = z.object({
  rejectionReason: z.string().min(1, 'Alasan penolakan harus diisi'),
});

export const createAssessmentSchema = z.object({
  studentUserId: z.string().min(1),
  kehadiran: z.number().min(0).max(100),
  kerjasama: z.number().min(0).max(100),
  sikapEtika: z.number().min(0).max(100),
  prestasiKerja: z.number().min(0).max(100),
  kreatifitas: z.number().min(0).max(100),
  feedback: z.string().optional(),
});

export const updateAssessmentSchema = z.object({
  kehadiran: z.number().min(0).max(100).optional(),
  kerjasama: z.number().min(0).max(100).optional(),
  sikapEtika: z.number().min(0).max(100).optional(),
  prestasiKerja: z.number().min(0).max(100).optional(),
  kreatifitas: z.number().min(0).max(100).optional(),
  feedback: z.string().optional(),
});
