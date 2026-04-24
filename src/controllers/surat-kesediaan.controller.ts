import { Context } from 'hono';
import { SuratKesediaanService } from '@/services/surat-kesediaan.service';
import { createResponse, handleError } from '@/utils/helpers';
import type { JWTPayload } from '@/types';
import {
  requestSuratKesediaanSchema,
  approveBulkSchema,
  rejectRequestSchema,
  reapplyRequestSchema,
} from '@/schemas/surat-kesediaan.schema';

export class SuratKesediaanController {
  constructor(private suratKesediaanService: SuratKesediaanService) {}

  /**
   * Mahasiswa: Ajukan surat kesediaan ke dosen
   * POST /api/mahasiswa/surat-kesediaan/requests
   */
  requestSuratKesediaan = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const body = await c.req.json();

      // Validate request body
      const validationResult = requestSuratKesediaanSchema.safeParse(body);
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const { memberUserId, dosenUserId } = validationResult.data;

      const result = await this.suratKesediaanService.requestSuratKesediaan(
        memberUserId,
        user.userId,
        dosenUserId
      );

      return c.json(
        createResponse(true, 'Pengajuan surat kesediaan berhasil dikirim ke dosen', {
          requestId: result.requestId,
        })
      );
    } catch (error) {
      return handleError(c, error, 'Failed to request surat kesediaan');
    }
  };

  /**
   * Dosen: Lihat list ajuan surat kesediaan
   * GET /api/dosen/surat-kesediaan/requests
   */
  getRequests = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;

      const requests = await this.suratKesediaanService.getRequestsForDosen(user.userId, user.role);

      return c.json(
        createResponse(true, 'OK', requests)
      );
    } catch (error) {
      return handleError(c, error, 'Failed to get requests');
    }
  };

  /**
   * Dosen: Approve single request
   * PUT /api/dosen/surat-kesediaan/requests/:requestId/approve
   */
  approveSingle = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const requestId = c.req.param('requestId');

      const result = await this.suratKesediaanService.approveSingleRequest(requestId, user.userId);

      return c.json(
        createResponse(true, 'Pengajuan berhasil disetujui dan surat telah ditandatangani', {
          requestId: result.requestId,
          status: result.status,
          approvedAt: result.approvedAt,
          signedFileUrl: result.signedFileUrl,
        })
      );
    } catch (error) {
      return handleError(c, error, 'Failed to approve request');
    }
  };

  /**
   * Dosen: Approve bulk requests
   * PUT /api/dosen/surat-kesediaan/requests/approve-bulk
   */
  approveBulk = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const body = await c.req.json();

      // Validate request body
      const validationResult = approveBulkSchema.safeParse(body);
      if (!validationResult.success) {
        return c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const { requestIds } = validationResult.data;
      const result = await this.suratKesediaanService.approveBulkRequests(
        requestIds,
        user.userId
      );

      const summaryMessage = `${result.approvedCount} pengajuan berhasil disetujui`;

      return c.json(
        createResponse(true, summaryMessage, {
          approvedCount: result.approvedCount,
          failed: result.failed,
        })
      );
    } catch (error) {
      return handleError(c, error, 'Failed to approve bulk requests');
    }
  };

  /**
   * Dosen: Reject single request
   * PUT /api/dosen/surat-kesediaan/requests/:requestId/reject
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
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const result = await this.suratKesediaanService.rejectRequest(
        requestId,
        user.userId,
        validationResult.data.rejection_reason
      );

      return c.json(
        createResponse(true, 'Pengajuan surat kesediaan berhasil ditolak', result)
      );
    } catch (error) {
      return handleError(c, error, 'Failed to reject request');
    }
  };

  /**
   * Mahasiswa: Ajukan ulang request surat kesediaan yang ditolak.
   * PUT /api/mahasiswa/surat-kesediaan/requests/:requestId/reapply
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
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const { memberUserId } = validationResult.data;
      const result = await this.suratKesediaanService.reapplyRequest(requestId, memberUserId, user.userId);

      return c.json(
        createResponse(true, 'Pengajuan ulang surat kesediaan berhasil.', result)
      );
    } catch (error) {
      return handleError(c, error, 'Failed to reapply surat kesediaan request');
    }
  };
}
