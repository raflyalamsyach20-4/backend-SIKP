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
  jumlahSksSelesai: z.number().int().nonnegative().optional(),
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
 * SSO Callback Schema
 */
export const authCallbackSchema = z.object({
  code: z.string().min(1, 'code is required'),
  state: z.string().min(1, 'state is required'),
  codeVerifier: z.string().min(1, 'codeVerifier is required'),
  redirectUri: z
    .string()
    .url('redirectUri must be a valid URL')
    .refine((value) => value.endsWith('/callback'), 'redirectUri must end with /callback'),
});

export type AuthCallbackInput = z.infer<typeof authCallbackSchema>;

/**
 * SSO Prepare Schema
 */
export const authPrepareSchema = z.object({
  codeChallenge: z.string().min(43, 'codeChallenge is too short').max(128, 'codeChallenge is too long'),
  redirectUri: z
    .string()
    .url('redirectUri must be a valid URL')
    .refine((value) => value.endsWith('/callback'), 'redirectUri must end with /callback')
    .optional(),
});

export type AuthPrepareInput = z.infer<typeof authPrepareSchema>;

/**
 * Select Active Identity Schema
 */
export const selectIdentitySchema = z.object({
  identityType: z.string().min(1, 'identityType is required'),
});

export type SelectIdentityInput = z.infer<typeof selectIdentitySchema>;

/**
 * Update Dosen Profile Schema
 */
export const updateDosenProfileSchema = z.object({
  nama: z.string().min(1, 'Name is required').max(255).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  jabatan: z.string().max(100).optional().nullable(),
  fakultas: z.string().max(100).optional().nullable(),
  prodi: z.string().max(100).optional().nullable(),
}).refine((data) => {
  // At least one field should be provided
  return Object.values(data).some(value => value !== undefined && value !== null);
}, 'At least one field must be provided for update');

export type UpdateDosenProfileInput = z.infer<typeof updateDosenProfileSchema>;

/**
 * Update Mahasiswa Profile Schema
 */
export const updateMahasiswaProfileSchema = z.object({
  nama: z.string().min(1, 'Name is required').max(255).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  fakultas: z.string().max(100).optional().nullable(),
  prodi: z.string().max(100).optional().nullable(),
  semester: z.number().int().positive().optional().nullable(),
  jumlahSksSelesai: z.number().int().nonnegative().optional().nullable(),
  angkatan: z.string().max(10).optional().nullable(),
}).refine((data) => {
  return Object.values(data).some(value => value !== undefined && value !== null);
}, 'At least one field must be provided for update');

export type UpdateMahasiswaProfileInput = z.infer<typeof updateMahasiswaProfileSchema>;

/**
 * Search Query Schema
 */
export const searchQuerySchema = z.object({
  q: z.string().min(ValidationRules.SEARCH_QUERY_MIN_LENGTH, 
    `Search query must be at least ${ValidationRules.SEARCH_QUERY_MIN_LENGTH} characters`),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
