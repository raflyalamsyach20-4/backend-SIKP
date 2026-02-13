import { z } from 'zod';
import { ValidationRules, UserRoles, AdminRoles } from '@/constants';

/**
 * Common field schemas
 */
const emailSchema = z.string().email().max(ValidationRules.EMAIL_MAX_LENGTH);
const passwordSchema = z.string().min(ValidationRules.PASSWORD_MIN_LENGTH);
const phoneSchema = z.string().max(ValidationRules.PHONE_MAX_LENGTH).optional();
const nimSchema = z.string().min(ValidationRules.NIM_MIN_LENGTH);
const nipSchema = z.string().min(ValidationRules.NIP_MIN_LENGTH);

/**
 * Register Mahasiswa Schema
 */
export const registerMahasiswaSchema = z.object({
  nim: nimSchema,
  nama: z.string().min(1, 'Name is required'),
  email: emailSchema,
  password: passwordSchema,
  fakultas: z.string().optional(),
  prodi: z.string().optional(),
  semester: z.number().int().positive().optional(),
  angkatan: z.string().optional(),
  phone: phoneSchema,
});

export type RegisterMahasiswaInput = z.infer<typeof registerMahasiswaSchema>;

/**
 * Register Admin Schema
 */
export const registerAdminSchema = z.object({
  nip: nipSchema,
  nama: z.string().min(1, 'Name is required'),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum([AdminRoles.ADMIN, AdminRoles.KAPRODI, AdminRoles.WAKIL_DEKAN]),
  fakultas: z.string().optional(),
  prodi: z.string().optional(),
  phone: phoneSchema,
});

export type RegisterAdminInput = z.infer<typeof registerAdminSchema>;

/**
 * Register Dosen Schema
 */
export const registerDosenSchema = z.object({
  nip: nipSchema,
  nama: z.string().min(1, 'Name is required'),
  email: emailSchema,
  password: passwordSchema,
  jabatan: z.string().optional(),
  fakultas: z.string().optional(),
  prodi: z.string().optional(),
  phone: phoneSchema,
});

export type RegisterDosenInput = z.infer<typeof registerDosenSchema>;

/**
 * Login Schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Search Query Schema
 */
export const searchQuerySchema = z.object({
  q: z.string().min(ValidationRules.SEARCH_QUERY_MIN_LENGTH, 
    `Search query must be at least ${ValidationRules.SEARCH_QUERY_MIN_LENGTH} characters`),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
