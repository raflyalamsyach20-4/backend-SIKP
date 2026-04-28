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
      console.log(`[SsoSignatureProxyService.getActiveSignature] START sessionId=${sessionId}`);
      const accessToken = await this.authService.getSessionAccessToken(sessionId);
      console.log(`[SsoSignatureProxyService.getActiveSignature] Token acquired, length=${accessToken?.length || 0}`);
      
      const url = this.baseSignatureUrl;
      console.log(`[SsoSignatureProxyService.getActiveSignature] Fetching from SSO: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      console.log(`[SsoSignatureProxyService.getActiveSignature] Response status: ${response.status}`);

      if (!response.ok) {
        const responseText = await response.text();
        console.error(`[SsoSignatureProxyService.getActiveSignature] Failed with status ${response.status}. Response: ${responseText.substring(0, 200)}`);
        return null;
      }

      const payload = (await response.json()) as SsoSignatureResponse;
      console.log(`[SsoSignatureProxyService.getActiveSignature] Success. Active signature: ${payload.data?.activeSignature?.signatureId || 'NONE'}`);
      return payload.data.activeSignature;
    } catch (error) {
      console.error(`[SsoSignatureProxyService.getActiveSignature] Exception:`, error instanceof Error ? error.message : error);
      return null;
    }
  }
}
