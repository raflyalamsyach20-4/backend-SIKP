import { Context } from 'hono';
import { AuthService } from '@/services/auth.service';
import { UserRepository } from '@/repositories/user.repository';
import { createResponse, handleError } from '@/utils/helpers';
import { z } from 'zod';

const registerMahasiswaSchema = z.object({
  nim: z.string().min(1),
  nama: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  fakultas: z.string().optional(),
  prodi: z.string().optional(),
  semester: z.number().optional(),
  angkatan: z.string().optional(),
  phone: z.string().optional(),
});

const registerAdminSchema = z.object({
  nip: z.string().min(1),
  nama: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'KAPRODI', 'WAKIL_DEKAN']),
  fakultas: z.string().optional(),
  prodi: z.string().optional(),
  phone: z.string().optional(),
});

const registerDosenSchema = z.object({
  nip: z.string().min(1),
  nama: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  jabatan: z.string().optional(),
  fakultas: z.string().optional(),
  prodi: z.string().optional(),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export class AuthController {
  constructor(
    private authService: AuthService,
    private userRepository: UserRepository
  ) {}

  registerMahasiswa = async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = registerMahasiswaSchema.parse(body);

      const result = await this.authService.registerMahasiswa(validated);

      return c.json(createResponse(true, 'Registration successful', result), 201);
    } catch (error: any) {
      return handleError(c, error, 'Registration failed');
    }
  };

  registerAdmin = async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = registerAdminSchema.parse(body);

      const result = await this.authService.registerAdmin(validated);

      return c.json(createResponse(true, 'Registration successful', result), 201);
    } catch (error: any) {
      return handleError(c, error, 'Registration failed');
    }
  };

  registerDosen = async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = registerDosenSchema.parse(body);

      const result = await this.authService.registerDosen(validated);

      return c.json(createResponse(true, 'Registration successful', result), 201);
    } catch (error: any) {
      return handleError(c, error, 'Registration failed');
    }
  };

  login = async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = loginSchema.parse(body);

      const result = await this.authService.login(validated.email, validated.password);

      return c.json(createResponse(true, 'Login successful', result));
    } catch (error: any) {
      return handleError(c, error, 'Login failed');
    }
  };

  me = async (c: Context) => {
    try {
      const user = c.get('user');
      return c.json(createResponse(true, 'User retrieved', user));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get user');
    }
  };

  searchMahasiswa = async (c: Context) => {
    try {
      const query = c.req.query('q');
      
      if (!query) {
        return c.json(createResponse(false, 'Search query cannot be empty'), 400);
      }

      if (query.length < 2) {
        return c.json(createResponse(false, 'Search query must be at least 2 characters'), 400);
      }

      const results = await this.userRepository.searchMahasiswa(query);
      
      return c.json(createResponse(true, 'Mahasiswa search results', results));
    } catch (error: any) {
      return handleError(c, error, 'Failed to search mahasiswa');
    }
  };
}
