import { Context } from 'hono';
import { ZodError } from 'zod';
import { createResponse, handleError } from '@/utils/helpers';
import { SuratPengantarDosenService } from '@/services/surat-pengantar-dosen.service';
import { rejectRequestSchema } from '@/schemas/surat-pengantar-dosen.schema';
import type { JWTPayload } from '@/types';

export class SuratPengantarDosenController {
  private suratPengantarDosenService: SuratPengantarDosenService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.suratPengantarDosenService = new SuratPengantarDosenService(this.c.env);
  }

  getRequests = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const sessionId = this.c.get('sessionId');
      const requests = await this.suratPengantarDosenService.getRequestsForVerifier(user.dosenId!, user.role, sessionId);
      return this.c.json(createResponse(true, 'Daftar pengajuan surat pengantar berhasil diambil', requests));
    } catch (error) {
      return handleError(this.c, error, 'Failed to get surat pengantar requests');
    }
  };

  approve = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const sessionId = this.c.get('sessionId');
      const requestId = this.c.req.param('requestId');
      const result = await this.suratPengantarDosenService.approveRequest(requestId, user.dosenId!, user.role, sessionId);

      return this.c.json(createResponse(true, 'Pengajuan surat pengantar berhasil disetujui', result));
    } catch (error) {
      return handleError(this.c, error, 'Failed to approve surat pengantar request');
    }
  };

  reject = async () => {
    try {
      const user = this.c.get('user') as JWTPayload;
      const requestId = this.c.req.param('requestId');
      const body = await this.c.req.json();
      const validated = rejectRequestSchema.parse(body);

      const result = await this.suratPengantarDosenService.rejectRequest(
        requestId,
        user.dosenId!,
        user.role,
        validated.rejection_reason.trim()
      );

      return this.c.json(createResponse(true, 'Pengajuan surat pengantar berhasil ditolak', result));
    } catch (error) {
      if (error instanceof ZodError) {
        return this.c.json(createResponse(false, 'Validation Error', { errors: error.issues }), 400);
      }

      return handleError(this.c, error, 'Failed to reject surat pengantar request');
    }
  };
}