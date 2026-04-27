import { Context } from 'hono';
import { SuratKesediaanService } from '@/services/surat-kesediaan.service';
import { createResponse, handleError } from '@/utils/helpers';
import {
  requestSuratKesediaanSchema,
  approveBulkSchema,
  rejectRequestSchema,
  reapplyRequestSchema,
} from '@/schemas/surat-kesediaan.schema';

export class SuratKesediaanController {
  private suratKesediaanService: SuratKesediaanService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.suratKesediaanService = new SuratKesediaanService(this.c.env);
  }

  /**
   * Mahasiswa: Ajukan surat kesediaan ke dosen
   * POST /api/mahasiswa/surat-kesediaan/requests
   */
  requestSuratKesediaan = async () => {
    try {
      const user = this.c.get('user');
      const sessionId = this.c.get('sessionId');
      const body = await this.c.req.json();

      // Validate request body
      const validationResult = requestSuratKesediaanSchema.safeParse(body);
      if (!validationResult.success) {
        return this.c.json(
          createResponse(false, 'Validation failed', {
            errors: validationResult.error.issues,
          }),
          400
        );
      }

      const { memberMahasiswaId } = validationResult.data;

      const result = await this.suratKesediaanService.requestSuratKesediaan(
        memberMahasiswaId,
        user.mahasiswaId!,
        sessionId
      );

      return this.c.json(
        createResponse(true, 'Pengajuan surat kesediaan berhasil dikirim ke dosen', {
          requestId: result.requestId,
        })
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to request surat kesediaan');
    }
  };

  /**
   * Dosen: Lihat list ajuan surat kesediaan
   * GET /api/dosen/surat-kesediaan/requests
   */
  getRequests = async () => {
    try {
      const user = this.c.get('user');
      const sessionId = this.c.get('sessionId');

      const requests = await this.suratKesediaanService.getRequestsForDosen(
        user.dosenId || user.userId,
        user.role,
        sessionId
      );

      return this.c.json(
        createResponse(true, 'OK', requests)
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to get requests');
    }
  };

  /**
   * Dosen: Approve single request
   * PUT /api/dosen/surat-kesediaan/requests/:requestId/approve
   */
  approveSingle = async () => {
    try {
      const user = this.c.get('user');
      const requestId = this.c.req.param('requestId');
      const sessionId = this.c.get('sessionId');

      const result = await this.suratKesediaanService.approveSingleRequest(
        requestId,
        user.dosenId || user.userId,
        sessionId
      );

      return this.c.json(
        createResponse(true, 'Pengajuan berhasil disetujui dan surat telah ditandatangani', {
          requestId: result.requestId,
          status: result.status,
          approvedAt: result.approvedAt,
          signedFileUrl: result.signedFileUrl,
        })
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to approve request');
    }
  };

  /**
   * Dosen: Approve bulk requests
   * PUT /api/dosen/surat-kesediaan/requests/approve-bulk
   */
  approveBulk = async () => {
    try {
      const user = this.c.get('user');
      const sessionId = this.c.get('sessionId');
      const body = await this.c.req.json();

      // Validate request body
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
      const result = await this.suratKesediaanService.approveBulkRequests(
        requestIds,
        user.dosenId || user.userId,
        sessionId
      );

      const summaryMessage = `${result.approvedCount} pengajuan berhasil disetujui`;

      return this.c.json(
        createResponse(true, summaryMessage, {
          approvedCount: result.approvedCount,
          failed: result.failed,
        })
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to approve bulk requests');
    }
  };

  /**
   * Dosen: Reject single request
   * PUT /api/dosen/surat-kesediaan/requests/:requestId/reject
   */
  reject = async () => {
    try {
      const user = this.c.get('user');
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

      const result = await this.suratKesediaanService.rejectRequest(
        requestId,
        user.dosenId || user.userId,
        validationResult.data.rejection_reason
      );

      return this.c.json(
        createResponse(true, 'Pengajuan surat kesediaan berhasil ditolak', result)
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to reject request');
    }
  };

  /**
   * Mahasiswa: Ajukan ulang request surat kesediaan yang ditolak.
   * PUT /api/mahasiswa/surat-kesediaan/requests/:requestId/reapply
   */
  reapplyRequest = async () => {
    try {
      const user = this.c.get('user');
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

      const { memberMahasiswaId } = validationResult.data;
      const result = await this.suratKesediaanService.reapplyRequest(requestId, memberMahasiswaId, user.mahasiswaId!);

      return this.c.json(
        createResponse(true, 'Pengajuan ulang surat kesediaan berhasil.', result)
      );
    } catch (error) {
      return handleError(this.c, error, 'Failed to reapply surat kesediaan request');
    }
  };
}
