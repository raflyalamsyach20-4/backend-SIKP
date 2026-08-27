import { Context } from "hono";
import { createResponse, handleError } from "@/utils/helpers";
import type { JWTPayload } from "@/types";
import { SsoSignatureProxyService } from "@/services/sso-signature-proxy.service";

export class SsoSignatureController {
  private ssoSignatureProxyService: SsoSignatureProxyService;

  constructor(private c: Context<{ Bindings: CloudflareBindings }>) {
    this.ssoSignatureProxyService = new SsoSignatureProxyService(this.c.env);
  }

  getManageProfileUrl = async () => {
    try {
      const user = this.c.get("user");
      const profileManageUrl = this.c.env.SSO_PROFILE_URL;

      if (!profileManageUrl) {
        return this.c.json(
          createResponse(false, "SSO_PROFILE_URL is not configured"),
          500,
        );
      }

      return this.c.json(
        createResponse(true, "Profile management is handled by SSO", {
          manageUrl: profileManageUrl,
          authUserId: user.authUserId,
          activeIdentity: user.activeIdentity?.identityType || null,
        }),
      );
    } catch (error) {
      return handleError(
        this.c,
        error,
        "Failed to resolve profile management URL",
      );
    }
  };

  getManageSignatureUrl = async () => {
    try {
      const user = this.c.get("user");
      const signatureManageUrl = this.c.env.SSO_PROFILE_SIGNATURE_URL;

      if (!signatureManageUrl) {
        return this.c.json(
          createResponse(false, "SSO_PROFILE_SIGNATURE_URL is not configured"),
          500,
        );
      }

      return this.c.json(
        createResponse(true, "Signature management is handled by SSO", {
          manageUrl: signatureManageUrl,
          authUserId: user.authUserId,
          activeIdentity: user.activeIdentity?.identityType || null,
        }),
      );
    } catch (error) {
      return handleError(
        this.c,
        error,
        "Failed to resolve signature management URL",
      );
    }
  };

  getActive = async () => {
    try {
      const user = this.c.get("user") as JWTPayload;
      const sessionId = this.c.get("sessionId") as string;

      const data = await this.ssoSignatureProxyService.getActiveSignature(
        sessionId,
        user,
      );

      // Sync to local DB if it's a mentor
      if (data && data.svg && user.profileId) {
        try {
          const { MentorService } = await import("@/services/mentor.service");
          const mentorService = new MentorService(this.c.env);

          // Sync using profileId (Main ID)
          await mentorService.syncSignatureFromSso(user.profileId, sessionId);

          // Also sync using mentorId (Identity ID) if available as fallback
          if (user.mentorId && user.mentorId !== user.profileId) {
            await mentorService.syncSignatureFromSso(user.mentorId, sessionId);
          }
        } catch (err) {
          console.warn(
            "[SsoSignatureController.getActive] Failed to sync to local DB:",
            err,
          );
        }
      }

      return this.c.json(createResponse(true, "Signature retrieved", data));
    } catch (error) {
      return handleError(this.c, error, "Failed to retrieve signature");
    }
  };

  /**
   * PUT /api/profile/signature/save-to-internship
   * Body: { internshipId: string, signatureBase64: string, mimeType?: string }
   *
   * Frontend sudah fetch TTD dari SSO via getActiveProfileSignature(),
   * lalu kirim hasilnya (base64) ke endpoint ini.
   * Backend langsung simpan ke kolom mentor_signature_base64 di tabel internships.
   * Tidak perlu backend fetch ulang ke SSO.
   */
  saveToInternship = async () => {
    try {
      const user = this.c.get("user") as JWTPayload;
      if (!user) {
        return this.c.json(createResponse(false, "Unauthorized"), 401);
      }

      const body = await this.c.req.json<{
        internshipId: string;
        signatureBase64: string;
        mimeType?: string;
      }>();

      if (!body?.internshipId || !body?.signatureBase64) {
        return this.c.json(
          createResponse(
            false,
            "Field 'internshipId' dan 'signatureBase64' wajib diisi.",
          ),
          400,
        );
      }

      const { MentorService } = await import("@/services/mentor.service");
      const mentorService = new MentorService(this.c.env);

      const result = await mentorService.saveSignatureDirectly(
        body.internshipId,
        body.signatureBase64,
        body.mimeType || "image/png",
      );

      return this.c.json(
        createResponse(true, "Tanda tangan berhasil disimpan ke database.", result),
        200,
      );
    } catch (error: any) {
      if (error?.statusCode) {
        return this.c.json(
          createResponse(false, error.message || "Gagal menyimpan TTD."),
          error.statusCode,
        );
      }
      return handleError(this.c, error, "Gagal menyimpan tanda tangan");
    }
  };
}

