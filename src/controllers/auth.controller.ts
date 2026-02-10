import { Context } from 'hono';
import { createSSOClient } from '@/lib/sso-client';
import { createResponse, handleError } from '@/utils/helpers';

export class AuthController {
  constructor(private ssoBaseUrl: string) {}

  /**
   * POST /auth/exchange
   * Exchange authorization code for access token (OAuth 2.0)
   */
  exchange = async (c: Context) => {
    try {
      const { code, codeVerifier } = await c.req.json();

      if (!code || !codeVerifier) {
        return c.json(
          createResponse(false, 'Missing code or code_verifier'),
          400
        );
      }

      const clientId = c.env.SSO_CLIENT_ID;
      const clientSecret = c.env.SSO_CLIENT_SECRET;
      const redirectUri = c.env.SSO_REDIRECT_URI;

      // Exchange authorization code for access token
      const tokenResponse = await fetch(`${this.ssoBaseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          code_verifier: codeVerifier,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json().catch(() => ({ message: 'Token exchange failed' }));
        console.error('[AUTH] Token exchange failed:', error);
        return c.json(
          createResponse(false, error.message || 'Failed to exchange token'),
          tokenResponse.status
        );
      }

      const tokenData = await tokenResponse.json();

      return c.json(
        createResponse(true, 'Token exchanged successfully', {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresIn: tokenData.expires_in,
          tokenType: tokenData.token_type || 'Bearer',
        })
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to exchange token');
    }
  };

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  refresh = async (c: Context) => {
    try {
      const { refreshToken } = await c.req.json();

      if (!refreshToken) {
        return c.json(
          createResponse(false, 'Missing refresh_token'),
          400
        );
      }

      const clientId = c.env.SSO_CLIENT_ID;
      const clientSecret = c.env.SSO_CLIENT_SECRET;

      // Refresh token
      const tokenResponse = await fetch(`${this.ssoBaseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json().catch(() => ({ message: 'Token refresh failed' }));
        console.error('[AUTH] Token refresh failed:', error);
        return c.json(
          createResponse(false, error.message || 'Failed to refresh token'),
          tokenResponse.status
        );
      }

      const tokenData = await tokenResponse.json();

      return c.json(
        createResponse(true, 'Token refreshed successfully', {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresIn: tokenData.expires_in,
          tokenType: tokenData.token_type || 'Bearer',
        })
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to refresh token');
    }
  };

  /**
   * GET /auth/me
   * Get current user info from SSO /profile endpoint (proxy)
   */
  me = async (c: Context) => {
    try {
      const token = c.req.header('Authorization')?.replace('Bearer ', '');

      if (!token) {
        return c.json({ error: 'Unauthorized', message: 'No token provided' }, 401);
      }

      // Get profile from SSO (proxy to Profile Service)
      const ssoClient = createSSOClient(this.ssoBaseUrl, token);
      const profileResponse = await ssoClient.getProfile();

      if (!profileResponse.success) {
        return c.json(
          createResponse(false, profileResponse.message || 'Failed to get profile'),
          404
        );
      }

      return c.json(createResponse(true, 'User info retrieved', profileResponse.data));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get user info');
    }
  };
}
