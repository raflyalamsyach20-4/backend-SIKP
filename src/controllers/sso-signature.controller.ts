import { Context } from 'hono';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';
import { SsoSignatureProxyService } from '@/services/sso-signature-proxy.service';

export class SsoSignatureController {
  constructor(private ssoSignatureProxyService: SsoSignatureProxyService) {}

  getManageProfileUrl = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const profileManageUrl = c.env.SSO_PROFILE_URL;

      if (!profileManageUrl) {
        return c.json(createResponse(false, 'SSO_PROFILE_URL is not configured'), 500);
      }

      return c.json(
        createResponse(true, 'Profile management is handled by SSO', {
          manageUrl: profileManageUrl,
          authUserId: user.authUserId,
          activeIdentity: user.activeIdentity?.identityType || null,
        })
      );
    } catch (error) {
      return handleError(c, error, 'Failed to resolve profile management URL');
    }
  };

  getManageSignatureUrl = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const signatureManageUrl = c.env.SSO_PROFILE_SIGNATURE_URL;

      if (!signatureManageUrl) {
        return c.json(createResponse(false, 'SSO_PROFILE_SIGNATURE_URL is not configured'), 500);
      }

      return c.json(
        createResponse(true, 'Signature management is handled by SSO', {
          manageUrl: signatureManageUrl,
          authUserId: user.authUserId,
          activeIdentity: user.activeIdentity?.identityType || null,
        })
      );
    } catch (error) {
      return handleError(c, error, 'Failed to resolve signature management URL');
    }
  };

  getActive = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const sessionId = c.get('sessionId') as string;

      const data = await this.ssoSignatureProxyService.getActiveSignature(sessionId, user);
      return c.json(createResponse(true, 'Signature retrieved', data));
    } catch (error) {
      return handleError(c, error, 'Failed to retrieve signature');
    }
  };

  upload = async (c: Context) => {
    try {
      return c.json(
        createResponse(
          false,
          'Signature write is not available in SIKP. Please manage signature in SSO.',
          {
            manageUrl: c.env.SSO_PROFILE_SIGNATURE_URL || null,
          }
        ),
        410
      );
    } catch (error) {
      return handleError(c, error, 'Failed to upload signature');
    }
  };

  activate = async (c: Context) => {
    try {
      return c.json(
        createResponse(
          false,
          'Signature write is not available in SIKP. Please manage signature in SSO.',
          {
            manageUrl: c.env.SSO_PROFILE_SIGNATURE_URL || null,
          }
        ),
        410
      );
    } catch (error) {
      return handleError(c, error, 'Failed to activate signature');
    }
  };

  remove = async (c: Context) => {
    try {
      return c.json(
        createResponse(
          false,
          'Signature write is not available in SIKP. Please manage signature in SSO.',
          {
            manageUrl: c.env.SSO_PROFILE_SIGNATURE_URL || null,
          }
        ),
        410
      );
    } catch (error) {
      return handleError(c, error, 'Failed to delete signature');
    }
  };
}
