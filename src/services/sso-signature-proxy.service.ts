import type {
  JWTPayload,
  SsoActiveSignature,
  SsoSignatureResponse,
} from "@/types";
import { AuthService } from "@/services/auth.service";

export class SsoSignatureProxyService {
  private authService: AuthService;

  constructor(private env: CloudflareBindings) {
    this.authService = new AuthService(this.env);
  }

  private get baseSignatureUrl(): string {
    const baseUrl = this.env.SSO_BASE_URL;
    if (!baseUrl) {
      const error = new Error("SSO_BASE_URL is not configured") as Error & {
        statusCode?: number;
      };
      error.statusCode = 500;
      throw error;
    }

    const signaturePath = this.env.SSO_SIGNATURE_PATH || "/profile/signature";
    return `${baseUrl}${signaturePath}`;
  }

  /**
   * Get active signature for the current session from SSO.
   */
  async getActiveSignature(
    sessionId: string,
    _user?: JWTPayload,
  ): Promise<SsoActiveSignature | null> {
    try {
      console.log(
        `[SsoSignatureProxyService.getActiveSignature] START sessionId=${sessionId}`,
      );
      const accessToken =
        await this.authService.getSessionAccessToken(sessionId);
      if (!accessToken) return null;
      console.log(
        `[SsoSignatureProxyService.getActiveSignature] Token acquired, length=${accessToken?.length || 0}`,
      );
      return await this.fetchActiveSignature(accessToken, "getActiveSignature");
    } catch (error) {
      console.error(
        `[SsoSignatureProxyService.getActiveSignature] Exception:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  /**
   * Get active signature using an existing access token.
   */
  async getActiveSignatureByAccessToken(
    accessToken: string,
  ): Promise<SsoActiveSignature | null> {
    return await this.fetchActiveSignature(
      accessToken,
      "getActiveSignatureByAccessToken",
    );
  }

  private async fetchActiveSignature(
    accessToken: string,
    caller: string,
  ): Promise<SsoActiveSignature | null> {
    try {
      const url = this.baseSignatureUrl;
      console.log(
        `[SsoSignatureProxyService.${caller}] Fetching from SSO: ${url}`,
      );

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      console.log(
        `[SsoSignatureProxyService.${caller}] Response status: ${response.status}`,
      );

      if (!response.ok) {
        const body = await response.clone().text();
        const isLegacyError =
          response.status === 410 ||
          response.status === 404 ||
          body.includes("legacy identity route") ||
          body.includes("big-bang cutover") ||
          body.includes("Endpoint not found");

        if (isLegacyError) {
          let fallbackUrl: string | null = null;
          if (url.endsWith("/profile/signature")) {
            fallbackUrl = url.replace("/profile/signature", "/me/signature");
          } else if (url.endsWith("/me/signature")) {
            fallbackUrl = url.replace("/me/signature", "/profile/signature");
          }

          if (fallbackUrl && fallbackUrl !== url) {
            console.warn(
              `[SsoSignatureProxyService.${caller}] Signature URL (${url}) failed. Trying fallback: ${fallbackUrl}`,
            );
            const retryResp = await fetch(fallbackUrl, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
              },
            });

            if (retryResp.ok) {
              const payload = (await retryResp.json()) as SsoSignatureResponse;
              return payload.data.activeSignature;
            }
          }
        }

        const responseText = await response.text();
        console.error(
          `[SsoSignatureProxyService.${caller}] Failed with status ${response.status}. Response: ${responseText.substring(0, 200)}`,
        );
        return null;
      }

      const payload = (await response.json()) as SsoSignatureResponse;
      console.log(
        `[SsoSignatureProxyService.${caller}] Success. Active signature: ${payload.data?.activeSignature?.signatureId || "NONE"}`,
      );
      return payload.data.activeSignature;
    } catch (error) {
      console.error(
        `[SsoSignatureProxyService.${caller}] Exception:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }
}
