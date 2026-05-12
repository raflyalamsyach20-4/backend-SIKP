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

  // Cached service token
  private _serviceToken: { token: string; expiresAt: number } | null = null;

  /**
   * Return access token for given sessionId, or null if not available.
   * Optimized to query database directly and avoid full session context load (SSO fetch).
   */
  async getSessionAccessToken(sessionId?: string | null): Promise<string | null> {
    if (!sessionId) return null;
    try {
      const session = await this.authSessionRepo.findSessionById(sessionId);
      if (!session || session.expiresAt.getTime() <= Date.now()) {
        return null;
      }
      return session.accessToken;
    } catch (err) {
      console.warn('[AuthService.getSessionAccessToken] failed to fetch session from DB', { sessionId, err });
      return null;
    }
  }


  /**
   * Get a service-level access token using client credentials grant.
   * Caches token until expiry.
   */
  async getServiceAccessToken(): Promise<string> {
    // return cached if still valid
    const now = Date.now();
    if (this._serviceToken && this._serviceToken.expiresAt > now + 5000) {
      return this._serviceToken.token;
    }

    // exchange client credentials
    const tokenUrl = this.env.SSO_TOKEN_URL || `${this.env.SSO_BASE_URL}/oauth/token`;
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.env.SSO_CLIENT_ID || '',
      client_secret: this.env.SSO_CLIENT_SECRET || '',
    });

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.warn(`[AuthService.getServiceAccessToken] client_credentials failed (${resp.status}): ${body}. Falling back to active ADMIN session token.`);
      
      // Fallback to an active ADMIN session token if client_credentials is not supported/configured
      const db = createDbClient(this.env.DATABASE_URL);
      const sessions = await db.query.authSessions.findMany({
        where: (s, { and, eq, gt }) => and(
          eq(s.activeIdentity, 'ADMIN'),
          gt(s.expiresAt, new Date())
        ),
        orderBy: (s, { desc }) => [desc(s.updatedAt)],
        limit: 1
      });

      if (sessions.length > 0 && sessions[0].accessToken) {
        return sessions[0].accessToken;
      }

      throw new Error(`Failed to obtain service token from SSO (${resp.status}): ${body}`);
    }

    const payload = (await resp.json()) as any;
    const token = payload?.access_token;
    const expiresIn = payload?.expires_in || 60 * 60; // default 1 hour
    this._serviceToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
    return token;
  }

  private getJwks() {
    if (!this.jwks) {
      this.assertSsoConfiguration();
      const jwksUrl = this.env.SSO_JWKS_URL || `${this.env.SSO_BASE_URL}/.well-known/jwks.json`;
      this.jwks = createRemoteJWKSet(new URL(jwksUrl));
    }

    return this.jwks;
  }

  private assertSsoConfiguration() {
    const requiredConfig: Array<{ key: string; value: string | undefined }> = [
      { key: "SSO_BASE_URL", value: this.env.SSO_BASE_URL },
      { key: "SSO_ISSUER", value: this.env.SSO_ISSUER },
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

    if (!this.env.SSO_REDIRECT_URI?.endsWith("/callback")) {
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
    const tokenUrl = this.env.SSO_TOKEN_URL || `${this.env.SSO_BASE_URL}/oauth/token`;
    const form = new URLSearchParams({
      grant_type: "AUTHORIZATION_CODE",
      code: payload.code,
      code_verifier: payload.codeVerifier,
      redirect_uri: payload.redirectUri,
      client_id: this.env.SSO_CLIENT_ID || '',
      client_secret: this.env.SSO_CLIENT_SECRET || '',
    });

    const response = await fetch(tokenUrl, {
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

    let profileUrl = this.env.SSO_USERINFO_URL || this.env.SSO_PROFILE_URL || `${this.env.SSO_BASE_URL}/profile`;
    console.log(`[AuthService.fetchProfileAndIdentities] Fetching from: ${profileUrl}`);
    
    let profileResp = await fetch(profileUrl, { headers });
    
    // If it fails with 404 or 410 or returns the specific "legacy route" message, try fallback
    if (!profileResp.ok) {
      const body = await profileResp.clone().text();
      const isLegacyError = profileResp.status === 410 || 
                          profileResp.status === 404 || 
                          body.includes("legacy identity route") || 
                          body.includes("big-bang cutover") ||
                          body.includes("Endpoint not found");
      
      if (isLegacyError) {
        let fallbackUrl: string | null = null;
        if (profileUrl.endsWith('/profile')) {
          fallbackUrl = `${this.env.SSO_BASE_URL}/me`;
        } else if (profileUrl.endsWith('/me')) {
          fallbackUrl = `${this.env.SSO_BASE_URL}/profile`;
        }

        if (fallbackUrl) {
          console.warn(`[AuthService.fetchProfileAndIdentities] Profile URL (${profileUrl}) failed or legacy detected. Trying fallback: ${fallbackUrl}`);
          profileResp = await fetch(fallbackUrl, { headers });
        }
      }
    }

    if (!profileResp.ok) {
      const body = await profileResp.text();
      console.error(`[AuthService.fetchProfileAndIdentities] SSO Error (${profileResp.status}):`, body);
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

    const effectiveRedirectUri = redirectUri || this.env.SSO_REDIRECT_URI || '';
    if (effectiveRedirectUri !== this.env.SSO_REDIRECT_URI) {
      const error = new Error(
        "redirectUri does not match configured SSO_REDIRECT_URI",
      ) as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const url = new URL(`${this.env.SSO_BASE_URL}/oauth/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.env.SSO_CLIENT_ID || '');
    url.searchParams.set("redirect_uri", effectiveRedirectUri);
    url.searchParams.set("scope", "OPENID PROFILE EMAIL");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return url.toString();
  }

  /**
   * Load session context using cached profile snapshot from DB.
   * Profile data is fetched from SSO ONCE at callback and stored as a
   * JSON snapshot. Subsequent calls read from DB — NO SSO /profile hit.
   * Token verification (JWT signature) is still performed to validate roles/permissions.
   */
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

    // ✅ CACHE-FIRST: Use profileSnapshot stored at callback time.
    // Only fallback to SSO /profile if snapshot is missing (e.g., old sessions).
    let profile: SsoEnvelope['data'];
    let identities: AuthIdentity[];

    const snapshot = session.profileSnapshot as SsoEnvelope['data'] | null;
    if (snapshot) {
      // Fast path: read from DB cache — zero SSO network calls
      profile = snapshot;
      identities = [];
      const rawIds = profile.identities;
      if (Array.isArray(rawIds)) {
        identities = rawIds.map((id: any) => ({ ...id, identityType: id.role || id.identityType }));
      } else if (rawIds) {
        if (rawIds.mahasiswa) identities.push({ ...rawIds.mahasiswa, identityType: 'MAHASISWA' });
        if (rawIds.dosen) identities.push({ ...rawIds.dosen, identityType: 'DOSEN' });
        if (rawIds.admin) identities.push({ ...rawIds.admin, identityType: 'ADMIN' });
        if (rawIds.mentor) identities.push({ ...rawIds.mentor, identityType: 'MENTOR' });
      }
    } else {
      // Slow path: old session without snapshot — hit SSO /profile once, then cache
      console.warn(
        '[AuthService.loadSessionContext] profileSnapshot missing, fetching from SSO and caching.',
        { sessionId },
      );
      const fetched = await this.fetchProfileAndIdentities(session.accessToken);
      profile = fetched.profile;
      identities = fetched.identities;

      // Persist snapshot so future requests skip this path
      await this.authSessionRepo.updateSession(sessionId, {
        profileSnapshot: profile as unknown as Record<string, unknown>,
      });
    }

    // JWT token verification (local public-key check — no SSO network call)
    const tokenPayload = (await this.verifyToken(
      session.accessToken,
    )) as SsoAccessTokenPayload;

    const effectiveRoles = tokenPayload.roles || [];
    const effectivePermissions = tokenPayload.permissions || [];

    const availableIdentities = identities;
    const activeIdentity =
      availableIdentities.find(
        (item) => item.identityType?.toLowerCase() === session.activeIdentity?.toLowerCase(),
      ) || null;

    const primaryRole = this.pickPrimaryRole(effectiveRoles);
    const inferredEmail = profile?.emails?.[0]?.email;

    // SSO Gateway may return identities as an array or an object depending on the version.
    const getIdentityObj = (role: string) => {
      const ids = profile.identities as any;
      if (Array.isArray(ids)) {
        return ids.find((i: any) => i.role === role || i.identityType === role);
      }
      return ids?.[role.toLowerCase()];
    };

    const mhs = getIdentityObj('MAHASISWA');
    const dsn = getIdentityObj('DOSEN');
    const adm = getIdentityObj('ADMIN');
    const mnt = getIdentityObj('MENTOR');

    const userPayload: JWTPayload = {
      sub: session.authUserId,
      userId: session.authUserId,
      authUserId: session.authUserId,
      sessionId: session.sessionId,
      email: inferredEmail || '',
      role: primaryRole,
      effectiveRoles,
      effectivePermissions,
      activeIdentity,
      availableIdentities,
      nama: profile.fullName,
      profileId: profile.id,
      mahasiswaId: mhs?.id,
      dosenId: dsn?.id,
      adminId: adm?.id,
      mentorId: mnt?.id,
      dosenPAId: mhs?.dosenPA?.id,
      nim: mhs?.nim,
      nipDosen: dsn?.nip,
      nipAdmin: adm?.nip,
      nidn: dsn?.nidn,
      phone: mnt?.noTelepon,
      jabatan: dsn?.jabatanFungsional,
      jabatanFungsional: dsn?.jabatanFungsional,
      jabatanStruktural: dsn?.jabatanStruktural,
      angkatan: mhs?.angkatan,
      semesterAktif: mhs?.semesterAktif,
      jumlahSksLulus: mhs?.jumlahSksLulus,
      prodi: mhs?.prodi?.nama,
      fakultas: mhs?.fakultas?.nama,
      prodiId: mhs?.prodi?.id,
      fakultasId: mhs?.fakultas?.id,
    };

    // ⚠️ Note: Strict dosenPAId validation removed per migration docs. 
    // This allows students to progress even if SSO data is incomplete.
    if (primaryRole === 'mahasiswa' && !userPayload.dosenPAId) {
       console.warn(`[loadSessionContext] ⚠️ Mahasiswa missing dosenPAId: ${session.authUserId}. Continuing as per migration policy.`);
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
      // ✅ Cache profile at login time — prevents /profile hits on every subsequent request
      profileSnapshot: profile as unknown as Record<string, unknown>,
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
        nipDosen: sessionContext.user.nipDosen,
        nipAdmin: sessionContext.user.nipAdmin,
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

  async getSessionAccessTokenOrThrow(sessionId: string): Promise<string> {
    const session = await this.authSessionRepo.findSessionById(sessionId);
    
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      const error = new Error("Session not found or expired") as Error & {
        statusCode?: number;
      };
      error.statusCode = 401;
      throw error;
    }

    if (!session.accessToken) {
      const error = new Error(
        "Session access token is not available",
      ) as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    return session.accessToken;
  }


  async logout(sessionId: string) {
    const session = await this.authSessionRepo.findSessionById(sessionId);

    if (session?.refreshToken) {
      try {
        const revokeUrl = this.env.SSO_REVOKE_URL || `${this.env.SSO_BASE_URL}/oauth/revoke`;
        const revokeBody = new URLSearchParams({
          token: session.refreshToken,
          client_id: this.env.SSO_CLIENT_ID || '',
          client_secret: this.env.SSO_CLIENT_SECRET || '',
        });

        await fetch(revokeUrl, {
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
