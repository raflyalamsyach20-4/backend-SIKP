import { Context } from 'hono';
import { z } from 'zod';
import type { JWTPayload } from '@/types';
import { SuratPermohonanService } from '@/services/surat-permohonan.service';
import { createResponse, handleError } from '@/utils/helpers';

const requestSuratPermohonanSchema = z.object({
  memberUserId: z.string().min(1),
});

const approveBulkSchema = z.object({
  requestIds: z.array(z.string().min(1)).min(1),
});

const rejectRequestSchema = z.object({
  rejection_reason: z.string().min(1, 'Alasan penolakan wajib diisi.').max(1000),
});

const reapplyRequestSchema = z.object({
  memberUserId: z.string().min(1),
});

export class SuratPermohonanController {
  constructor(private suratPermohonanService: SuratPermohonanService) {}

  /**
   * Mahasiswa: ajukan surat permohonan KP
   * POST /api/mahasiswa/surat-permohonan/requests
   */
  requestSuratPermohonan = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const body = await c.req.json();

      const validationResult = requestSuratPermohonanSchema.safeParse(body);
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.errors,
          }),
          400
        );
      }

      const { memberUserId } = validationResult.data;

      const result = await this.suratPermohonanService.requestSuratPermohonan(
        memberUserId,
        user.userId
      );

      return c.json(
        createResponse(true, 'Pengajuan surat permohonan berhasil dikirim ke dosen', {
          requestId: result.requestId,
        })
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to request surat permohonan');
    }
  };

  /**
   * Dosen: list semua ajuan surat permohonan
   * GET /api/dosen/surat-permohonan/requests
   */
  getRequests = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const requests = await this.suratPermohonanService.getRequestsForDosen(user.userId);

      return c.json(createResponse(true, 'OK', requests));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get surat permohonan requests');
    }
  };

  /**
   * Dosen: approve single request
   * PUT /api/dosen/surat-permohonan/requests/:requestId/approve
   */
  approveSingle = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const requestId = c.req.param('requestId');

      const result = await this.suratPermohonanService.approveSingleRequest(requestId, user.userId);

      return c.json(
        createResponse(true, 'Pengajuan surat permohonan berhasil disetujui', {
          requestId: result.requestId,
          status: result.status,
          approvedAt: result.approvedAt,
          signedFileUrl: result.signedFileUrl,
        })
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to approve surat permohonan request');
    }
  };

  /**
   * Dosen: approve bulk requests
   * PUT /api/dosen/surat-permohonan/requests/approve-bulk
   */
  approveBulk = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const body = await c.req.json();

      const validationResult = approveBulkSchema.safeParse(body);
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.errors,
          }),
          400
        );
      }

      const { requestIds } = validationResult.data;
      const result = await this.suratPermohonanService.approveBulkRequests(requestIds, user.userId);

      return c.json(
        createResponse(true, `${result.approvedCount} pengajuan berhasil disetujui`, {
          approvedCount: result.approvedCount,
          failed: result.failed,
        })
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to approve bulk surat permohonan requests');
    }
  };

  /**
   * Dosen: reject request
   * PUT /api/dosen/surat-permohonan/requests/:requestId/reject
   */
  reject = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const requestId = c.req.param('requestId');
      const body = await c.req.json().catch(() => ({}));

      const validationResult = rejectRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.errors,
          }),
          400
        );
      }

      const result = await this.suratPermohonanService.rejectRequest(
        requestId,
        user.userId,
        validationResult.data.rejection_reason
      );

      return c.json(
        createResponse(true, 'Pengajuan surat permohonan berhasil ditolak', result)
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to reject surat permohonan request');
    }
  };

  /**
   * Mahasiswa: Ajukan ulang request surat permohonan yang ditolak.
   * PUT /api/mahasiswa/surat-permohonan/requests/:requestId/reapply
   */
  reapplyRequest = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const requestId = c.req.param('requestId');
      const body = await c.req.json().catch(() => ({}));

      const validationResult = reapplyRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.errors,
          }),
          400
        );
      }

      const { memberUserId } = validationResult.data;
      const result = await this.suratPermohonanService.reapplyRequest(requestId, memberUserId, user.userId);

      return c.json(
        createResponse(true, 'Pengajuan ulang surat permohonan berhasil.', result)
      );
    } catch (error: any) {
      return handleError(c, error, 'Failed to reapply surat permohonan request');
    }
  };
}
