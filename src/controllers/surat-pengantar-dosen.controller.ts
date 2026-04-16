import { Context } from 'hono';
import { z } from 'zod';
import { createResponse, handleError } from '@/utils/helpers';
import { SuratPengantarDosenService } from '@/services/surat-pengantar-dosen.service';
import type { JWTPayload } from '@/types';

const rejectRequestSchema = z.object({
  rejection_reason: z.string().min(1),
});

export class SuratPengantarDosenController {
  constructor(private suratPengantarDosenService: SuratPengantarDosenService) {}

  getRequests = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const requests = await this.suratPengantarDosenService.getRequestsForVerifier(user.userId, user.role);
      return c.json(createResponse(true, 'Daftar pengajuan surat pengantar berhasil diambil', requests));
    } catch (error: any) {
      return handleError(c, error, 'Failed to get surat pengantar requests');
    }
  };

  approve = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const requestId = c.req.param('requestId');
      const result = await this.suratPengantarDosenService.approveRequest(requestId, user.userId, user.role);

      return c.json(createResponse(true, 'Pengajuan surat pengantar berhasil disetujui', result));
    } catch (error: any) {
      return handleError(c, error, 'Failed to approve surat pengantar request');
    }
  };

  reject = async (c: Context) => {
    try {
      const user = c.get('user') as JWTPayload;
      const requestId = c.req.param('requestId');
      const body = await c.req.json();
      const validated = rejectRequestSchema.parse(body);

      const result = await this.suratPengantarDosenService.rejectRequest(
        requestId,
        user.userId,
        user.role,
        validated.rejection_reason.trim()
      );

      return c.json(createResponse(true, 'Pengajuan surat pengantar berhasil ditolak', result));
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return c.json(createResponse(false, 'Validation Error', { errors: error.errors }), 400);
      }

      return handleError(c, error, 'Failed to reject surat pengantar request');
    }
  };
}