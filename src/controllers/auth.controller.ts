import { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { AuthService } from '@/services/auth.service';
import { createResponse, generateId, handleError } from '@/utils/helpers';
import {
  AuthCallbackInput,
  AuthPrepareInput,
  SelectIdentityInput,
} from '@/validation';
import { SuccessMessages, ErrorMessages } from '@/constants';

/**
 * Auth Controller
 * Handles authentication and user management endpoints
 */
export class AuthController {
  private authService: AuthService;

  constructor(
    private c: Context<{ Bindings: CloudflareBindings }>
  ) {
    this.authService = new AuthService(this.c.env);
  }

  /**
   * Prepare OAuth flow by issuing verified state cookie and authorize URL.
   */
  prepare = async (data: AuthPrepareInput) => {
    try {
      const state = generateId();
      const authorizeUrl = this.authService.buildAuthorizeUrl(
        state,
        data.codeChallenge,
        data.redirectUri || this.c.env.SSO_REDIRECT_URI
      );

      setCookie(this.c, 'sikp_oauth_state', state, {
        httpOnly: true,
        secure: Boolean(this.c.env.AUTH_COOKIE_SECURE),
        sameSite: this.c.env.AUTH_COOKIE_SAMESITE as "strict" | "lax" | "none",
        path: '/',
        maxAge: 600,
      });

      return this.c.json(createResponse(true, 'SSO authorize URL generated', {
        state,
        authorizeUrl,
      }));
    } catch (error) {
      return handleError(this.c, error, ErrorMessages.BAD_REQUEST);
    }
  };

  /**
   * OAuth callback handler (authorization code + PKCE)
   */
  callback = async (data: AuthCallbackInput) => {
    try {
      const expectedState = getCookie(this.c, 'sikp_oauth_state');

      const result = await this.authService.handleCallback(data, expectedState || null);

      setCookie(this.c, this.c.env.AUTH_SESSION_COOKIE_NAME, result.sessionId, {
        httpOnly: true,
        secure: Boolean(this.c.env.AUTH_COOKIE_SECURE),
        sameSite: this.c.env.AUTH_COOKIE_SAMESITE as "strict" | "lax" | "none",
        path: '/',
        maxAge: Number(this.c.env.AUTH_SESSION_TTL_SECONDS),
      });

      if (expectedState) {
        deleteCookie(this.c, 'sikp_oauth_state', { path: '/' });
      }

      if (result.requiresIdentitySelection) {
        return this.c.json(createResponse(true, SuccessMessages.LOGIN_SUCCESS, {
          sessionEstablished: false,
          requiresIdentitySelection: true,
          identities: result.identities,
          effectivePermissions: result.effectivePermissions,
        }));
      }

      return this.c.json(createResponse(true, SuccessMessages.LOGIN_SUCCESS, {
        sessionEstablished: true,
        requiresIdentitySelection: false,
        activeIdentity: result.activeIdentity,
        effectiveRoles: result.effectiveRoles,
        effectivePermissions: result.effectivePermissions,
      }));
    } catch (error) {
      return handleError(this.c, error, ErrorMessages.LOGIN_FAILED);
    }
  };

  /**
   * Get identities from current session
   */
  identities = async () => {
    try {
      const sessionId = this.c.get('sessionId');
      const identities = await this.authService.getIdentities(sessionId);

      return this.c.json(createResponse(true, 'User identities retrieved', {
        identities,
      }));
    } catch (error) {
      return handleError(this.c, error, ErrorMessages.UNAUTHORIZED);
    }
  };

  /**
   * Select active identity for current session
   */
  selectIdentity = async (data: SelectIdentityInput) => {
    try {
      const sessionId = this.c.get('sessionId');

      const result = await this.authService.selectIdentity(sessionId, data.identityType);

      return this.c.json(createResponse(true, 'Identity selected', {
        activeIdentity: result.activeIdentity,
        effectiveRoles: result.effectiveRoles,
        effectivePermissions: result.effectivePermissions,
      }));
    } catch (error) {
      return handleError(this.c, error, ErrorMessages.BAD_REQUEST);
    }
  };

  /**
   * Get current user information
   */
  me = async () => {
    try {
      const sessionId = this.c.get('sessionId');
      const me = await this.authService.getMe(sessionId);

      return this.c.json(createResponse(true, SuccessMessages.USER_RETRIEVED, me));
    } catch (error) {
      return handleError(this.c, error, ErrorMessages.USER_NOT_FOUND);
    }
  };

  /**
   * Logout current session
   */
  logout = async () => {
    try {
      const sessionId = this.c.get('sessionId');
      await this.authService.logout(sessionId);

      deleteCookie(this.c, this.c.env.AUTH_SESSION_COOKIE_NAME, {
        path: '/',
      });

      return this.c.json(createResponse(true, 'Logout successful'));
    } catch (error) {
      return handleError(this.c, error, ErrorMessages.UNAUTHORIZED);
    }
  };
}
