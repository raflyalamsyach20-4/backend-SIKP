import { Context } from 'hono';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';
import { SsoSignatureProxyService } from '@/services/sso-signature-proxy.service';

export class SsoSignatureController {
  private ssoSignatureProxyService: SsoSignatureProxyService;

  constructor(
    private c: Context<{ Bindings: CloudflareBindings }>
  ) {
    this.ssoSignatureProxyService = new SsoSignatureProxyService(this.c.env);
  }

  getManageProfileUrl = async () => {
    try {
      const user = this.c.get('user');
      const profileManageUrl = this.c.env.SSO_PROFILE_URL;

      if (!profileManageUrl) {
        return this.c.json(createResponse(false, 'SSO_PROFILE_URL is not configured'), 500);
      }

      return this.c.json(
        createResponse(true, 'Profile management is handled by SSO', {
          manageUrl: profileManageUrl,
          authUserId: user.authUserId,
          activeIdentity: user.activeIdentity?.identityType || null,
        })
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to resolve profile management URL');
    }
  };

  getManageSignatureUrl = async () => {
    try {
      const user = this.c.get('user');
      const signatureManageUrl = this.c.env.SSO_PROFILE_SIGNATURE_URL;

      if (!signatureManageUrl) {
        return this.c.json(createResponse(false, 'SSO_PROFILE_SIGNATURE_URL is not configured'), 500);
      }

      return this.c.json(
        createResponse(true, 'Signature management is handled by SSO', {
          manageUrl: signatureManageUrl,
          authUserId: user.authUserId,
          activeIdentity: user.activeIdentity?.identityType || null,
        })
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to resolve signature management URL');
    }
  };

  getActive = async () => {
    try {
      const user = this.c.get('user');
      const sessionId = this.c.get('sessionId');

      const data = await this.ssoSignatureProxyService.getActiveSignature(sessionId, user);
      return this.c.json(createResponse(true, 'Signature retrieved', data));
    } catch (error) {
      return handleError(this.c, error, 'Failed to retrieve signature');
    }
  };
}
