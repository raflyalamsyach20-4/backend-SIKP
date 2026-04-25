import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload as JoseJWTPayload,
} from "jose";
import type { AppConfig } from "@/config";
import { AuthSessionRepository } from "@/repositories/auth-session.repository";
import type {
  AuthIdentity,
  AuthSessionContext,
  JWTPayload,
  RbacRole,
  SsoAccessTokenPayload,
  SsoEnvelope,
} from "@/types";
import { generateId } from "@/utils/helpers";
import { createDbClient } from "@/db";

const SSO_ROLE_MAP: Record<string, RbacRole> = {
  MAHASISWA: "mahasiswa",
  DOSEN: "dosen",
  ADMIN: "admin",
  MENTOR: "mentor",
  KAPRODI: "kaprodi",
  WAKIL_DEKAN: "wakil_dekan",
};

const ROLE_PRIORITY: RbacRole[] = [
  "admin",
  "wakil_dekan",
  "kaprodi",
  "dosen",
  "mentor",
  "mahasiswa",
];
const BLOCKED_ONLY_SSO_ROLES = new Set(["user", "superadmin"]);

type CallbackPayload = {
  code: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
};

type TokenExchangeResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
};

export class AuthService {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private authSessionRepo: AuthSessionRepository;

  constructor(
    private env: CloudflareBindings
  ) {
    const dbClient = createDbClient(this.env.DATABASE_URL);
    this.authSessionRepo = new AuthSessionRepository(dbClient);
  }

  private getJwks() {
    if (!this.jwks) {
      this.assertSsoConfiguration();
      this.jwks = createRemoteJWKSet(new URL(this.env.SSO_JWKS_URL));
    }

    return this.jwks;
  }

  private assertSsoConfiguration() {
    const requiredConfig: Array<{ key: string; value: string }> = [
      { key: "SSO_BASE_URL", value: this.env.SSO_BASE_URL },
      { key: "SSO_ISSUER", value: this.env.SSO_ISSUER },
      { key: "SSO_JWKS_URL", value: this.env.SSO_JWKS_URL },
      { key: "SSO_CLIENT_ID", value: this.env.SSO_CLIENT_ID },
      { key: "SSO_CLIENT_SECRET", value: this.env.SSO_CLIENT_SECRET },
      { key: "SSO_REDIRECT_URI", value: this.env.SSO_REDIRECT_URI },
      { key: "SSO_PROFILE_URL", value: this.env.SSO_PROFILE_URL },
      {
        key: "SSO_PROFILE_SIGNATURE_URL",
        value: this.env.SSO_PROFILE_SIGNATURE_URL,
      },
    ];

    const missing = requiredConfig.filter(
      (item) => !item.value || !item.value.trim(),
    );

    if (missing.length > 0) {
      const error = new Error(
        `Missing required SSO configuration: ${missing.map((item) => item.key).join(", ")}`,
      ) as Error & { statusCode?: number };
      error.statusCode = 500;
      throw error;
    }

    if (!this.env.SSO_REDIRECT_URI.endsWith("/callback")) {
      const error = new Error(
        "SSO_REDIRECT_URI must end with /callback",
      ) as Error & { statusCode?: number };
      error.statusCode = 500;
      throw error;
    }
  }

  private pickPrimaryRole(roles: RbacRole[]): RbacRole {
    if (roles.length === 0) {
      return "mahasiswa"; // Default fallback
    }

    for (const role of ROLE_PRIORITY) {
      if (roles.includes(role)) {
        return role;
      }
    }

    return roles[0]; // Fallback to first role if not found in priority
  }

  private isBlockedOnlySsoRoleSet(rawRoleTags: RbacRole[]): boolean {
    if (rawRoleTags.length === 0) {
      return false;
    }

    const hasAllowedRole = rawRoleTags.some((roleTag) =>
      Boolean(SSO_ROLE_MAP[roleTag]),
    );
    if (hasAllowedRole) {
      return false;
    }

    return rawRoleTags.every((roleTag) => BLOCKED_ONLY_SSO_ROLES.has(roleTag));
  }

  private async verifyToken(token: string): Promise<JoseJWTPayload> {
    const verified = await jwtVerify(token, this.getJwks(), {
      issuer: this.env.SSO_ISSUER,
      audience: this.env.SSO_CLIENT_ID,
    });

    return verified.payload;
  }

  private async exchangeAuthorizationCode(
    payload: CallbackPayload,
  ): Promise<TokenExchangeResponse> {
    const form = new URLSearchParams({
      grant_type: "AUTHORIZATION_CODE",
      code: payload.code,
      code_verifier: payload.codeVerifier,
      redirect_uri: payload.redirectUri,
      client_id: this.env.SSO_CLIENT_ID,
      client_secret: this.env.SSO_CLIENT_SECRET,
    });

    const response = await fetch(this.env.SSO_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(
        `Failed to exchange authorization code with SSO (${response.status}): ${body}`,
      ) as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    return (await response.json()) as TokenExchangeResponse;
  }

  private async fetchProfileAndIdentities(accessToken: string) {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    const profileResp = await fetch(this.env.SSO_PROFILE_URL, { headers });
    if (!profileResp.ok) {
      const body = await profileResp.text();
      const error = new Error(
        `Failed to fetch user profile from SSO (${profileResp.status}): ${body}`,
      ) as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    const payload = (await profileResp.json()) as SsoEnvelope;
    const profile = payload.data;

    if (!profile) {
      throw new Error("Empty profile data from SSO");
    }

    const identities: AuthIdentity[] = [];
    const rawIds = profile.identities;

    if (rawIds.mahasiswa) {
      identities.push({ ...rawIds.mahasiswa, identityType: "MAHASISWA" });
    }
    if (rawIds.dosen) {
      identities.push({ ...rawIds.dosen, identityType: "DOSEN" });
    }
    if (rawIds.admin) {
      identities.push({ ...rawIds.admin, identityType: "ADMIN" });
    }
    if (rawIds.mentor) {
      identities.push({ ...rawIds.mentor, identityType: "MENTOR" });
    }

    return { profile, identities };
  }

  private ensureValidCallbackPayload(payload: CallbackPayload) {
    this.assertSsoConfiguration();

    if (!payload.redirectUri.endsWith("/callback")) {
      const error = new Error(
        "redirectUri must end with /callback",
      ) as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    if (payload.redirectUri !== this.env.SSO_REDIRECT_URI) {
      const error = new Error(
        "redirectUri does not match configured SSO_REDIRECT_URI",
      ) as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
  }

  buildAuthorizeUrl(
    state: string,
    codeChallenge: string,
    redirectUri?: string,
  ): string {
    this.assertSsoConfiguration();

    const effectiveRedirectUri = redirectUri || this.env.SSO_REDIRECT_URI;
    if (effectiveRedirectUri !== this.env.SSO_REDIRECT_URI) {
      const error = new Error(
        "redirectUri does not match configured SSO_REDIRECT_URI",
      ) as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const url = new URL(`${this.env.SSO_BASE_URL}/oauth/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.env.SSO_CLIENT_ID);
    url.searchParams.set("redirect_uri", effectiveRedirectUri);
    url.searchParams.set("scope", "OPENID PROFILE EMAIL");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return url.toString();
  }

  private async loadSessionContext(
    sessionId: string,
  ): Promise<AuthSessionContext | null> {
    await this.authSessionRepo.deleteExpiredSessions();

    const session = await this.authSessionRepo.findSessionById(sessionId);
    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.authSessionRepo.deleteSession(sessionId);
      return null;
    }

    if (!session.accessToken) {
      return null;
    }

    const { profile, identities } = await this.fetchProfileAndIdentities(
      session.accessToken,
    );

    const tokenPayload = (await this.verifyToken(
      session.accessToken,
    )) as SsoAccessTokenPayload;

    const effectiveRoles = tokenPayload.roles || [];
    const effectivePermissions = tokenPayload.permissions || [];

    const availableIdentities = identities;
    const activeIdentity =
      availableIdentities.find(
        (item) => item.identityType === session.activeIdentity,
      ) || null;

    const primaryRole = this.pickPrimaryRole(effectiveRoles);
    const inferredEmail = profile?.emails[0].email;

    const userPayload: JWTPayload = {
      sub: session.authUserId,
      userId: session.authUserId,
      authUserId: session.authUserId,
      sessionId: session.sessionId,
      email: inferredEmail,
      role: primaryRole,
      effectiveRoles,
      effectivePermissions,
      activeIdentity,
      availableIdentities,
      nama: profile.fullName,
      profileId: profile.id,
      dosenPAId: profile.identities.mahasiswa?.dosenPA?.profileId,
      nim: profile.identities.mahasiswa?.nim,
      nip: profile.identities.admin?.nip,
      nidn: profile.identities.dosen?.nidn,
      phone: profile.identities.mentor?.noTelepon,
      jabatan: profile.identities.dosen?.jabatanFungsional,
      jabatanFungsional: profile.identities.dosen?.jabatanFungsional,
      jabatanStruktural: profile.identities.dosen?.jabatanStruktural,
      angkatan: profile.identities.mahasiswa?.angkatan,
      semesterAktif: profile.identities.mahasiswa?.semesterAktif,
      jumlahSksLulus: profile.identities.mahasiswa?.jumlahSksLulus,
      prodi: profile.identities.mahasiswa?.prodi?.nama,
      fakultas: profile.identities.mahasiswa?.fakultas?.nama,
    };

    // ✅ VALIDATE: Mahasiswa must have dosenPAId
    if (primaryRole === 'mahasiswa' && !userPayload.dosenPAId) {
      console.error(`[loadSessionContext] ❌ Mahasiswa missing dosenPAId: ${session.authUserId}`);
      const error = new Error('Dosen PA tidak ditemukan. Hubungi administrator untuk mengatur dosen PA.') as Error & {
        statusCode?: number;
      };
      error.statusCode = 400;
      throw error;
    }

    return {
      sessionId: session.sessionId,
      authUserId: session.authUserId,
      user: userPayload,
      activeIdentity,
      availableIdentities,
      effectiveRoles,
      effectivePermissions,
      expiresAt: session.expiresAt,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  async handleCallback(
    payload: CallbackPayload,
    expectedState?: string | null,
  ) {
    this.ensureValidCallbackPayload(payload);

    if (!expectedState) {
      const error = new Error(
        "Missing OAuth state verification cookie. Call /api/auth/prepare before login.",
      ) as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    if (payload.state !== expectedState) {
      const error = new Error("Invalid OAuth state") as Error & {
        statusCode?: number;
      };
      error.statusCode = 401;
      throw error;
    }

    const tokens = await this.exchangeAuthorizationCode(payload);

    let verifiedPayload: JoseJWTPayload | null = null;
    let verifiedAccessTokenPayload: SsoAccessTokenPayload | null = null;

    if (tokens.id_token) {
      verifiedPayload = await this.verifyToken(tokens.id_token);
    }

    if (tokens.access_token && tokens.access_token.split(".").length === 3) {
      verifiedAccessTokenPayload = (await this.verifyToken(
        tokens.access_token,
      )) as SsoAccessTokenPayload;
      if (!verifiedPayload) {
        verifiedPayload = verifiedAccessTokenPayload;
      }
    }

    if (!verifiedAccessTokenPayload) {
      const error = new Error("No access token returned by SSO") as Error & {
        statusCode?: number;
      };
      error.statusCode = 401;
      throw error;
    }

    const { profile, identities } = await this.fetchProfileAndIdentities(
      tokens.access_token,
    );

    const effectiveRoles = verifiedAccessTokenPayload.roles;
    const effectivePermissions = verifiedAccessTokenPayload.permissions;

    if (this.isBlockedOnlySsoRoleSet(effectiveRoles)) {
      const error = new Error(
        "Role SSO Anda tidak diizinkan mengakses SIKP.",
      ) as Error & { statusCode?: number };
      error.statusCode = 403;
      throw error;
    }

    const authUserId = verifiedPayload?.sub || profile.authUserId;

    if (!authUserId) {
      const error = new Error("No authUserId returned by SSO") as Error & {
        statusCode?: number;
      };
      error.statusCode = 403;
      throw error;
    }

    const activeIdentity = identities.length === 1 ? identities[0] : null;

    const sessionId = generateId();
    const expiresAt = new Date(Date.now() + Number(this.env.AUTH_SESSION_TTL_SECONDS) * 1000);

    await this.authSessionRepo.createSession({
      sessionId,
      authUserId: String(authUserId),
      activeIdentity: activeIdentity?.identityType || null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      idToken: tokens.id_token || null,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.info("[AUTH][SSO_CALLBACK]", {
      authUserId,
      sessionId,
      requiresIdentitySelection: !activeIdentity,
      activeIdentity: activeIdentity?.identityType || null,
      identityCount: identities.length,
    });

    return {
      sessionId,
      sessionEstablished: Boolean(activeIdentity),
      requiresIdentitySelection: !activeIdentity,
      activeIdentity,
      identities,
      effectiveRoles,
      effectivePermissions,
    };
  }

  async getSessionContext(
    sessionId: string,
  ): Promise<AuthSessionContext | null> {
    return this.loadSessionContext(sessionId);
  }

  async getIdentities(sessionId: string): Promise<AuthIdentity[]> {
    const sessionContext = await this.loadSessionContext(sessionId);
    if (!sessionContext) {
      const error = new Error("Session not found or expired") as Error & {
        statusCode?: number;
      };
      error.statusCode = 401;
      throw error;
    }

    return sessionContext.availableIdentities;
  }

  async selectIdentity(sessionId: string, identityType: string) {
    const sessionContext = await this.loadSessionContext(sessionId);
    if (!sessionContext) {
      const error = new Error("Session not found or expired") as Error & {
        statusCode?: number;
      };
      error.statusCode = 401;
      throw error;
    }

    const selectedIdentity = sessionContext.availableIdentities.find(
      (identity) =>
        identity.identityType.toUpperCase() === identityType.toUpperCase(),
    );

    if (!selectedIdentity) {
      const error = new Error(
        "Selected identity is not available for this session",
      ) as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    // Roles and Permissions are derived from the access token and stored in sessionContext.user
    const effectiveRoles = sessionContext.user.effectiveRoles || [];
    const effectivePermissions = sessionContext.user.effectivePermissions || [];

    await this.authSessionRepo.updateSession(sessionId, {
      activeIdentity: selectedIdentity.identityType,
    });

    console.info("[AUTH][IDENTITY_SELECTED]", {
      authUserId: sessionContext.authUserId,
      sessionId,
      identityType: selectedIdentity.identityType,
      effectiveRoles,
      effectivePermissions,
    });

    return {
      activeIdentity: selectedIdentity,
      effectiveRoles,
      effectivePermissions,
    };
  }

  async getMe(sessionId: string) {
    const sessionContext = await this.loadSessionContext(sessionId);
    if (!sessionContext) {
      const error = new Error("Session not found or expired") as Error & {
        statusCode?: number;
      };
      error.statusCode = 401;
      throw error;
    }

    return {
      user: {
        id: sessionContext.user.userId,
        authUserId: sessionContext.authUserId,
        authProvider: "SSO_UNSRI",
        nama: sessionContext.user.nama,
        email: sessionContext.user.email,
        role: sessionContext.user.role,
        isActive: true,
        nim: sessionContext.user.nim,
        nip: sessionContext.user.nip,
        nidn: sessionContext.user.nidn,
        phone: sessionContext.user.phone,
        jabatan: sessionContext.user.jabatan,
        jabatanFungsional: sessionContext.user.jabatanFungsional,
        jabatanStruktural: sessionContext.user.jabatanStruktural,
        angkatan: sessionContext.user.angkatan,
        semesterAktif: sessionContext.user.semesterAktif,
        jumlahSksLulus: sessionContext.user.jumlahSksLulus,
        prodi: sessionContext.user.prodi,
        fakultas: sessionContext.user.fakultas,
      },
      activeIdentity: sessionContext.activeIdentity,
      availableIdentities: sessionContext.availableIdentities,
      effectiveRoles: sessionContext.effectiveRoles,
      effectivePermissions: sessionContext.effectivePermissions,
      authzSource: "ACCESS_TOKEN_CLAIMS",
    };
  }

  async authenticateSession(sessionId: string): Promise<JWTPayload> {
    const sessionContext = await this.loadSessionContext(sessionId);
    if (!sessionContext) {
      const error = new Error("Session not found or expired") as Error & {
        statusCode?: number;
      };
      error.statusCode = 401;
      throw error;
    }

    return sessionContext.user;
  }

  async getSessionAccessToken(sessionId: string): Promise<string> {
    const sessionContext = await this.loadSessionContext(sessionId);
    if (!sessionContext) {
      const error = new Error("Session not found or expired") as Error & {
        statusCode?: number;
      };
      error.statusCode = 401;
      throw error;
    }

    if (!sessionContext.accessToken) {
      const error = new Error(
        "Session access token is not available",
      ) as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    return sessionContext.accessToken;
  }

  async logout(sessionId: string) {
    const session = await this.authSessionRepo.findSessionById(sessionId);

    if (session?.refreshToken) {
      try {
        const revokeBody = new URLSearchParams({
          token: session.refreshToken,
          client_id: this.env.SSO_CLIENT_ID,
          client_secret: this.env.SSO_CLIENT_SECRET,
        });

        await fetch(this.env.SSO_REVOKE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: revokeBody.toString(),
        });
      } catch (error) {
        console.warn(
          "Failed to revoke SSO refresh token during logout:",
          error,
        );
      }
    }

    await this.authSessionRepo.deleteSession(sessionId);

    console.info("[AUTH][LOGOUT]", {
      sessionId,
      authUserId: session?.authUserId || null,
    });
  }

  async registerMahasiswa() {
    const error = new Error(
      "Local registration has been disabled. Please login via SSO UNSRI.",
    ) as Error & { statusCode?: number };
    error.statusCode = 410;
    throw error;
  }

  async registerAdmin() {
    const error = new Error(
      "Local registration has been disabled. Please login via SSO UNSRI.",
    ) as Error & { statusCode?: number };
    error.statusCode = 410;
    throw error;
  }

  async registerDosen() {
    const error = new Error(
      "Local registration has been disabled. Please login via SSO UNSRI.",
    ) as Error & { statusCode?: number };
    error.statusCode = 410;
    throw error;
  }

  async login() {
    const error = new Error(
      "Local login has been disabled. Please login via SSO UNSRI.",
    ) as Error & { statusCode?: number };
    error.statusCode = 410;
    throw error;
  }
}
