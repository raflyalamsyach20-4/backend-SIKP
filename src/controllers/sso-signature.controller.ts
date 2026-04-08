import { Context } from 'hono';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';
import { SsoSignatureProxyService } from '@/services/profile-signature.service';

export class SsoSignatureController {
  constructor(private ssoSignatureProxyService: SsoSignatureProxyService) {}

  getActive = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const sessionId = c.get('sessionId') as string;

      const data = await this.ssoSignatureProxyService.getActiveSignature(sessionId, user);
      return c.json(createResponse(true, 'Signature retrieved', data));
    } catch (error: any) {
      return handleError(c, error, 'Failed to retrieve signature');
    }
  };

  upload = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const sessionId = c.get('sessionId') as string;
      const formData = await c.req.formData();
      const signatureFile = formData.get('signatureFile');

      if (!signatureFile || typeof signatureFile === 'string') {
        return c.json(createResponse(false, 'signatureFile is required'), 400);
      }

      const data = await this.ssoSignatureProxyService.uploadSignature(sessionId, user, signatureFile as File);
      return c.json(createResponse(true, 'Signature uploaded', data));
    } catch (error: any) {
      return handleError(c, error, 'Failed to upload signature');
    }
  };

  activate = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const sessionId = c.get('sessionId') as string;
      const signatureId = c.req.param('id');

      if (!signatureId) {
        return c.json(createResponse(false, 'signature id is required'), 400);
      }

      const data = await this.ssoSignatureProxyService.activateSignature(sessionId, user, signatureId);
      return c.json(createResponse(true, 'Signature activated', data));
    } catch (error: any) {
      return handleError(c, error, 'Failed to activate signature');
    }
  };

  remove = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const sessionId = c.get('sessionId') as string;
      const signatureId = c.req.param('id');

      if (!signatureId) {
        return c.json(createResponse(false, 'signature id is required'), 400);
      }

      const data = await this.ssoSignatureProxyService.deleteSignature(sessionId, user, signatureId);
      return c.json(createResponse(true, 'Signature deleted', data));
    } catch (error: any) {
      return handleError(c, error, 'Failed to delete signature');
    }
  };
}
