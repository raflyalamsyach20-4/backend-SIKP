import type { AppConfig } from '@/config';
import type { JWTPayload, UserRole } from '@/types';
import { AuthService } from '@/services/auth.service';

const WRITE_ALLOWED_ROLES: UserRole[] = [
  'MAHASISWA',
  'DOSEN',
  'KAPRODI',
  'WAKIL_DEKAN',
  'ADMIN',
];

const READ_ALLOWED_ROLES: UserRole[] = [
  'MAHASISWA',
  'DOSEN',
  'KAPRODI',
  'WAKIL_DEKAN',
  'ADMIN',
  'PEMBIMBING_LAPANGAN',
];

export class SsoSignatureProxyService {
  constructor(
    private authService: AuthService,
    private config: AppConfig
  ) {}

  private get baseSignatureUrl(): string {
    const baseUrl = this.config.sso.baseUrl;
    if (!baseUrl) {
      const error = new Error('SSO_BASE_URL is not configured') as Error & { statusCode?: number };
      error.statusCode = 500;
      throw error;
    }

    return `${baseUrl}${this.config.sso.signaturePath}`;
  }

  private assertRole(user: JWTPayload, mode: 'read' | 'write') {
    const roles = user.effectiveRoles && user.effectiveRoles.length > 0
      ? user.effectiveRoles
      : [user.role];

    const allowedRoles = mode === 'write' ? WRITE_ALLOWED_ROLES : READ_ALLOWED_ROLES;
    const allowed = roles.some((role) => allowedRoles.includes(role));

    if (!allowed) {
      const error = new Error('Forbidden: insufficient role for signature operation') as Error & { statusCode?: number };
      error.statusCode = 403;
      throw error;
    }
  }

  private async request(
    sessionId: string,
    user: JWTPayload,
    input: {
      method: 'GET' | 'POST' | 'DELETE';
      url: string;
      body?: FormData;
      mode: 'read' | 'write';
    }
  ) {
    if (!user.activeIdentity) {
      const error = new Error('Active identity is required') as Error & { statusCode?: number };
      error.statusCode = 403;
      throw error;
    }

    this.assertRole(user, input.mode);

    const token = await this.authService.getSessionAccessToken(sessionId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.sso.proxyTimeoutMs);

    try {
      const response = await fetch(input.url, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'X-Auth-User-Id': user.authUserId || '',
          'X-Active-Identity': user.activeIdentity.identityType,
        },
        body: input.body,
        signal: controller.signal,
      });

      const text = await response.text();
      let payload: any = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { message: text };
        }
      }

      if (!response.ok) {
        const message = payload?.message || `SSO signature proxy request failed (${response.status})`;
        const error = new Error(message) as Error & { statusCode?: number };
        error.statusCode = response.status;
        throw error;
      }

      return payload;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('SSO signature proxy request timed out') as Error & { statusCode?: number };
        timeoutError.statusCode = 504;
        throw timeoutError;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getActiveSignature(sessionId: string, user: JWTPayload) {
    return this.request(sessionId, user, {
      method: 'GET',
      url: this.baseSignatureUrl,
      mode: 'read',
    });
  }

  async uploadSignature(sessionId: string, user: JWTPayload, signatureFile: File) {
    const formData = new FormData();
    formData.set('signatureFile', signatureFile);

    return this.request(sessionId, user, {
      method: 'POST',
      url: this.baseSignatureUrl,
      body: formData,
      mode: 'write',
    });
  }

  async activateSignature(sessionId: string, user: JWTPayload, signatureId: string) {
    return this.request(sessionId, user, {
      method: 'POST',
      url: `${this.baseSignatureUrl}/${encodeURIComponent(signatureId)}/activate`,
      mode: 'write',
    });
  }

  async deleteSignature(sessionId: string, user: JWTPayload, signatureId: string) {
    return this.request(sessionId, user, {
      method: 'DELETE',
      url: `${this.baseSignatureUrl}/${encodeURIComponent(signatureId)}`,
      mode: 'write',
    });
  }
}
