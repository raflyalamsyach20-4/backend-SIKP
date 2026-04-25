import type { JWTPayload, RbacRole } from '@/types';
import { AuthService } from '@/services/auth.service';

const WRITE_ALLOWED_ROLES: RbacRole[] = [
  'mahasiswa',
  'dosen',
  'kaprodi',
  'wakil_dekan',
  'admin',
];

const READ_ALLOWED_ROLES: RbacRole[] = [
  'mahasiswa',
  'dosen',
  'kaprodi',
  'wakil_dekan',
  'admin',
  'mentor',
];

type ProxyPayload = { message?: string } | null;

const parseProxyPayload = (text: string): ProxyPayload => {
  if (!text) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as { message?: string };
    }

    return { message: String(parsed) };
  } catch {
    return { message: text };
  }
};

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

  private assertRole(user: JWTPayload, mode: 'read' | 'write') {
    const roles = user.effectiveRoles && user.effectiveRoles.length > 0
      ? user.effectiveRoles
      : [];

    if (roles.length === 0) {
      const error = new Error('Forbidden: missing effective roles in auth context') as Error & { statusCode?: number };
      error.statusCode = 403;
      throw error;
    }

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
    const timeoutMs = Number(this.env.SSO_PROXY_TIMEOUT_MS) || 10000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
        const payload = parseProxyPayload(text);

      if (!response.ok) {
        const message = payload?.message || `SSO signature proxy request failed (${response.status})`;
        const error = new Error(message) as Error & { statusCode?: number };
        error.statusCode = response.status;
        throw error;
      }

      return payload;
    } catch (error) {
      const err = error as { name?: string };
      if (err.name === 'AbortError') {
        const timeoutError = new Error('SSO signature proxy request timed out') as Error & { statusCode?: number };
        timeoutError.statusCode = 504;
        throw timeoutError;
      }

      throw err;
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
}
