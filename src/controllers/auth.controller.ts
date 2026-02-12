import { Context } from 'hono';
import { createSSOClient, type SSOProfileResponse } from '@/lib/sso-client';
import { createResponse, handleError } from '@/utils/helpers';

type ExchangeRequestBody = {
  code: string;
  codeVerifier: string;
};

type RefreshRequestBody = {
  refreshToken: string;
};

type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

type ExchangeResponseData = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
};

type RefreshResponseData = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
};

export class AuthController {
  constructor(private ssoBaseUrl: string) {}

  /**
   * POST /auth/exchange
   * Exchange authorization code for access token (OAuth 2.0)
   *
   * Return (success):
   * - HTTP 200
   * - { success: true, message: string, data: { accessToken, refreshToken?, expiresIn?, tokenType } }
   *
   * Return (failure):
   * - HTTP 400 when code/codeVerifier missing
   * - HTTP <upstream status> when SSO token exchange fails
   * - HTTP 500 for unexpected errors
   */
  exchange = async (c: Context): Promise<Response> => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as Partial<ExchangeRequestBody>;
      const code = body.code;
      const codeVerifier = body.codeVerifier;

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
        const error: any = await tokenResponse.json().catch(() => ({ message: 'Token exchange failed' }));
        console.error('[AUTH] Token exchange failed:', error);
        return c.json(
          createResponse(false, error.message || 'Failed to exchange token'),
          tokenResponse.status as any
        );
      }

      const tokenData = (await tokenResponse.json()) as OAuthTokenResponse;

      const responseData: ExchangeResponseData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type || 'Bearer',
      };

      return c.json(
        createResponse<ExchangeResponseData>(true, 'Token exchanged successfully', responseData)
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to exchange token');
    }
  };

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   *
   * Return (success):
   * - HTTP 200
   * - { success: true, message: string, data: { accessToken, refreshToken?, expiresIn?, tokenType } }
   *
   * Return (failure):
   * - HTTP 400 when refreshToken missing
   * - HTTP <upstream status> when SSO refresh fails
   * - HTTP 500 for unexpected errors
   */
  refresh = async (c: Context): Promise<Response> => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as Partial<RefreshRequestBody>;
      const refreshToken = body.refreshToken;

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
        const error: any = await tokenResponse.json().catch(() => ({ message: 'Token refresh failed' }));
        console.error('[AUTH] Token refresh failed:', error);
        return c.json(
          createResponse(false, error.message || 'Failed to refresh token'),
          tokenResponse.status as any
        );
      }

      const tokenData = (await tokenResponse.json()) as OAuthTokenResponse;

      const responseData: RefreshResponseData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type || 'Bearer',
      };

      return c.json(
        createResponse<RefreshResponseData>(true, 'Token refreshed successfully', responseData)
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to refresh token');
    }
  };

  /**
   * GET /auth/me
   * Get current user info from SSO /profile endpoint (proxy)
   *
   * Return (success):
   * - HTTP 200
   * - { success: true, message: string, data: <SSO profile data> }
   *
   * Return (failure):
   * - HTTP 401 when missing Authorization header
   * - HTTP 404 when SSO returns success=false (profile not found / blocked)
   * - HTTP 500 for unexpected errors
   */
  me = async (c: Context): Promise<Response> => {
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

      return c.json(
        createResponse<NonNullable<SSOProfileResponse['data']>>(
          true,
          'User info retrieved',
          profileResponse.data as NonNullable<SSOProfileResponse['data']>
        )
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to get user info');
    }
  };
}
