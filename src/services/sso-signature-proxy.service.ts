import type { JWTPayload, SsoActiveSignature, SsoSignatureResponse } from '@/types';
import { AuthService } from '@/services/auth.service';

export class SsoSignatureProxyService {
  private authService: AuthService;

  constructor(
    private env: CloudflareBindings
  ) {
    this.authService = new AuthService(this.env);
  }

  private get baseSignatureUrl(): string {
    const baseUrl = this.env.SSO_BASE_URL;
    if (!baseUrl) {
      const error = new Error('SSO_BASE_URL is not configured') as Error & { statusCode?: number };
      error.statusCode = 500;
      throw error;
    }

    const signaturePath = this.env.SSO_SIGNATURE_PATH || '/profile/signature';
    return `${baseUrl}${signaturePath}`;
  }

  /**
   * Get active signature for the current session from SSO.
   */
  async getActiveSignature(sessionId: string, _user?: JWTPayload): Promise<SsoActiveSignature | null> {
    try {
      const accessToken = await this.authService.getSessionAccessToken(sessionId);
      
      const response = await fetch(this.baseSignatureUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`[SsoSignatureProxyService.getActiveSignature] Proxy failed with status: ${response.status}`);
        return null;
      }

      const payload = (await response.json()) as SsoSignatureResponse;
      return payload.data.activeSignature;
    } catch (error) {
      console.error(`[SsoSignatureProxyService.getActiveSignature] Error fetching signature from SSO:`, error);
      return null;
    }
  }
}
