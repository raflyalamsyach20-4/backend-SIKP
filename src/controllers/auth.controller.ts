import { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { AuthService } from '@/services/auth.service';
import { UserRepository } from '@/repositories/user.repository';
import { createResponse, generateId, handleError } from '@/utils/helpers';
import {
  authCallbackSchema,
  authPrepareSchema,
  selectIdentitySchema,
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
   * Legacy endpoint kept for compatibility (disabled after SSO cutover)
   */
  registerMahasiswa = async (c: Context) => {
    try {
      await this.authService.registerMahasiswa();
      return c.json(createResponse(false, 'Local registration has been disabled. Please use SSO UNSRI.'), 410);
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.REGISTRATION_FAILED);
    }
  };

  /**
   * Legacy endpoint kept for compatibility (disabled after SSO cutover)
   */
  registerAdmin = async (c: Context) => {
    try {
      await this.authService.registerAdmin();
      return c.json(createResponse(false, 'Local registration has been disabled. Please use SSO UNSRI.'), 410);
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.REGISTRATION_FAILED);
    }
  };

  /**
   * Legacy endpoint kept for compatibility (disabled after SSO cutover)
   */
  registerDosen = async (c: Context) => {
    try {
      await this.authService.registerDosen();
      return c.json(createResponse(false, 'Local registration has been disabled. Please use SSO UNSRI.'), 410);
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.REGISTRATION_FAILED);
    }
  };

  /**
   * Legacy endpoint kept for compatibility (disabled after SSO cutover)
   */
  login = async (c: Context) => {
    try {
      await this.authService.login();
      return c.json(createResponse(false, 'Local login has been disabled. Please use SSO UNSRI.'), 410);
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.LOGIN_FAILED);
    }
  };

  /**
   * Prepare OAuth flow by issuing verified state cookie and authorize URL.
   */
  prepare = async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = authPrepareSchema.parse(body);

      const state = generateId();
      const authorizeUrl = this.authService.buildAuthorizeUrl(
        state,
        validated.codeChallenge,
        validated.redirectUri || this.authService.ssoRedirectUri
      );

      setCookie(c, 'sikp_oauth_state', state, {
        httpOnly: true,
        secure: this.authService.sessionCookieSecure,
        sameSite: this.authService.sessionCookieSameSite,
        path: '/',
        maxAge: 600,
      });

      return c.json(createResponse(true, 'SSO authorize URL generated', {
        state,
        authorizeUrl,
      }));
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.BAD_REQUEST);
    }
  };

  /**
   * OAuth callback handler (authorization code + PKCE)
   */
  callback = async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = authCallbackSchema.parse(body);
      const expectedState = getCookie(c, 'sikp_oauth_state');

      const result = await this.authService.handleCallback(validated, expectedState || null);

      setCookie(c, this.authService.sessionCookieName, result.sessionId, {
        httpOnly: true,
        secure: this.authService.sessionCookieSecure,
        sameSite: this.authService.sessionCookieSameSite,
        path: '/',
        maxAge: this.authService.sessionTtlSeconds,
      });

      if (expectedState) {
        deleteCookie(c, 'sikp_oauth_state', { path: '/' });
      }

      if (result.requiresIdentitySelection) {
        return c.json(createResponse(true, SuccessMessages.LOGIN_SUCCESS, {
          sessionEstablished: false,
          requiresIdentitySelection: true,
          identities: result.identities,
        }));
      }

      return c.json(createResponse(true, SuccessMessages.LOGIN_SUCCESS, {
        sessionEstablished: true,
        requiresIdentitySelection: false,
        activeIdentity: result.activeIdentity,
        effectiveRoles: result.effectiveRoles,
      }));
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.LOGIN_FAILED);
    }
  };

  /**
   * Get identities from current session
   */
  identities = async (c: Context) => {
    try {
      const sessionId = c.get('sessionId') as string;
      const identities = await this.authService.getIdentities(sessionId);

      return c.json(createResponse(true, 'User identities retrieved', {
        identities,
      }));
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.UNAUTHORIZED);
    }
  };

  /**
   * Select active identity for current session
   */
  selectIdentity = async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = selectIdentitySchema.parse(body);
      const sessionId = c.get('sessionId') as string;

      const result = await this.authService.selectIdentity(sessionId, validated.identityType);

      return c.json(createResponse(true, 'Identity selected', {
        activeIdentity: result.activeIdentity,
        effectiveRoles: result.effectiveRoles,
      }));
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.BAD_REQUEST);
    }
  };

  /**
   * Get current user information
   */
  me = async (c: Context) => {
    try {
      const sessionId = c.get('sessionId') as string;
      const me = await this.authService.getMe(sessionId);

      return c.json(createResponse(true, SuccessMessages.USER_RETRIEVED, me));
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.USER_NOT_FOUND);
    }
  };

  /**
   * Logout current session
   */
  logout = async (c: Context) => {
    try {
      const sessionId = c.get('sessionId') as string;
      await this.authService.logout(sessionId);

      deleteCookie(c, this.authService.sessionCookieName, {
        path: '/',
      });

      return c.json(createResponse(true, 'Logout successful'));
    } catch (error: any) {
      return handleError(c, error, ErrorMessages.UNAUTHORIZED);
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
