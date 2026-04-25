import { Context } from 'hono';
import type { JWTPayload } from '@/types';
import { SuratPermohonanService } from '@/services/surat-permohonan.service';
import { createResponse, handleError } from '@/utils/helpers';
import {
  requestSuratPermohonanSchema,
  approveBulkSchema,
  rejectRequestSchema,
  reapplyRequestSchema,
} from '@/schemas/surat-permohonan.schema';

export class SuratPermohonanController {
  private suratPermohonanService: SuratPermohonanService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.suratPermohonanService = new SuratPermohonanService(this.c.env);
  }

  /**
   * Mahasiswa: ajukan surat permohonan KP
   * POST /api/mahasiswa/surat-permohonan/requests
   */
  requestSuratPermohonan = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const body = await this.c.req.json();

      const validationResult = requestSuratPermohonanSchema.safeParse(body);
      if (!validationResult.success) {
        return this.c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const { memberUserId } = validationResult.data;

      const result = await this.suratPermohonanService.requestSuratPermohonan(
        memberUserId,
        user.mahasiswaId!
      );

      return this.c.json(
        createResponse(true, 'Pengajuan surat permohonan berhasil dikirim ke dosen', {
          requestId: result.requestId,
        })
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to request surat permohonan');
    }
  };

  /**
   * Dosen: list semua ajuan surat permohonan
   * GET /api/dosen/surat-permohonan/requests
   */
  getRequests = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const requests = await this.suratPermohonanService.getRequestsForDosen(
        user.dosenId || user.userId,
        user.role
      );

      return this.c.json(createResponse(true, 'OK', requests));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get surat permohonan requests');
    }
  };

  /**
   * Dosen: approve single request
   * PUT /api/dosen/surat-permohonan/requests/:requestId/approve
   */
  approveSingle = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const requestId = this.c.req.param('requestId');

      const result = await this.suratPermohonanService.approveSingleRequest(
        requestId,
        user.dosenId || user.userId
      );

      return this.c.json(
        createResponse(true, 'Pengajuan surat permohonan berhasil disetujui', {
          requestId: result.requestId,
          status: result.status,
          approvedAt: result.approvedAt,
          signedFileUrl: result.signedFileUrl,
        })
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to approve surat permohonan request');
    }
  };

  /**
   * Dosen: approve bulk requests
   * PUT /api/dosen/surat-permohonan/requests/approve-bulk
   */
  approveBulk = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const body = await this.c.req.json();

      const validationResult = approveBulkSchema.safeParse(body);
      if (!validationResult.success) {
        return this.c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const { requestIds } = validationResult.data;
      const result = await this.suratPermohonanService.approveBulkRequests(
        requestIds,
        user.dosenId || user.userId
      );

      return this.c.json(
        createResponse(true, `${result.approvedCount} pengajuan berhasil disetujui`, {
          approvedCount: result.approvedCount,
          failed: result.failed,
        })
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to approve bulk surat permohonan requests');
    }
  };

  /**
   * Dosen: reject request
   * PUT /api/dosen/surat-permohonan/requests/:requestId/reject
   */
  reject = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const requestId = this.c.req.param('requestId');
      const body = await this.c.req.json().catch(() => ({}));

      const validationResult = rejectRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return this.c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const result = await this.suratPermohonanService.rejectRequest(
        requestId,
        user.dosenId || user.userId,
        validationResult.data.rejection_reason
      );

      return this.c.json(
        createResponse(true, 'Pengajuan surat permohonan berhasil ditolak', result)
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to reject surat permohonan request');
    }
  };

  /**
   * Mahasiswa: Ajukan ulang request surat permohonan yang ditolak.
   * PUT /api/mahasiswa/surat-permohonan/requests/:requestId/reapply
   */
  reapplyRequest = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const requestId = this.c.req.param('requestId');
      const body = await this.c.req.json().catch(() => ({}));

      const validationResult = reapplyRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return this.c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const { memberUserId } = validationResult.data;
      const result = await this.suratPermohonanService.reapplyRequest(requestId, memberUserId, user.mahasiswaId!);

      return this.c.json(
        createResponse(true, 'Pengajuan ulang surat permohonan berhasil.', result)
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to reapply surat permohonan request');
    }
  };
}
