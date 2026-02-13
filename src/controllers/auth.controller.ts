import { Context } from 'hono';
import { AuthService } from '@/services/auth.service';
import { UserRepository } from '@/repositories/user.repository';
import { createResponse, handleError } from '@/utils/helpers';
import {
  registerMahasiswaSchema,
  registerAdminSchema,
  registerDosenSchema,
  loginSchema,
} from '@/validation';
import { SuccessMessages, ErrorMessages, ValidationRules } from '@/constants';

/**
 * Auth Controller
 * Handles authentication and user management endpoints
 */
export class AuthController {
  constructor(
    private authService: AuthService,
    private userRepository: UserRepository
  ) {}

  /**
   * Register a new mahasiswa
   */
  registerMahasiswa = async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = registerMahasiswaSchema.parse(body);

      const result = await this.authService.registerMahasiswa(validated);

      return c.json(
        createResponse(true, SuccessMessages.REGISTRATION_SUCCESS, result),
        201
      );
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.REGISTRATION_FAILED);
    }
  };

  /**
   * Register a new admin/kaprodi/wakil dekan
   */
  registerAdmin = async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = registerAdminSchema.parse(body);

      const result = await this.authService.registerAdmin(validated);

      return c.json(
        createResponse(true, SuccessMessages.REGISTRATION_SUCCESS, result),
        201
      );
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.REGISTRATION_FAILED);
    }
  };

  /**
   * Register a new dosen
   */
  registerDosen = async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = registerDosenSchema.parse(body);

      const result = await this.authService.registerDosen(validated);

      return c.json(
        createResponse(true, SuccessMessages.REGISTRATION_SUCCESS, result),
        201
      );
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.REGISTRATION_FAILED);
    }
  };

  /**
   * Login user
   */
  login = async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = loginSchema.parse(body);

      const result = await this.authService.login(
        validated.email,
        validated.password
      );

      return c.json(createResponse(true, SuccessMessages.LOGIN_SUCCESS, result));
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.LOGIN_FAILED);
    }
  };

  /**
   * Get current user information
   */
  me = async (c: Context) => {
    try {
      const user = c.get('user');
      return c.json(createResponse(true, SuccessMessages.USER_RETRIEVED, user));
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.USER_NOT_FOUND);
    }
  };

  /**
   * Search for mahasiswa by query
   */
  searchMahasiswa = async (c: Context) => {
    try {
      const query = c.req.query('q');

      if (!query) {
        return c.json(
          createResponse(false, ErrorMessages.SEARCH_QUERY_EMPTY),
          400
        );
      }

      if (query.length < ValidationRules.SEARCH_QUERY_MIN_LENGTH) {
        return c.json(
          createResponse(false, ErrorMessages.SEARCH_QUERY_TOO_SHORT),
          400
        );
      }

      const results = await this.userRepository.searchMahasiswa(query);

      return c.json(
        createResponse(true, 'Mahasiswa search results', results)
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to search mahasiswa');
    }
  };
}
