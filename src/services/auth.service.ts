import { createRemoteJWKSet, jwtVerify, type JWTPayload as JoseJWTPayload } from 'jose';
import type { AppConfig } from '@/config';
import { AuthSessionRepository } from '@/repositories/auth-session.repository';
import { UserRepository } from '@/repositories/user.repository';
import type { AuthIdentity, AuthSessionContext, JWTPayload, UserRole } from '@/types';
import { generateId } from '@/utils/helpers';

const SSO_ROLE_MAP: Record<string, UserRole> = {
  MAHASISWA: 'MAHASISWA',
  DOSEN: 'DOSEN',
  ADMIN: 'ADMIN',
  MENTOR: 'PEMBIMBING_LAPANGAN',
  PEMBIMBING_LAPANGAN: 'PEMBIMBING_LAPANGAN',
  KAPRODI: 'KAPRODI',
  WAKIL_DEKAN: 'WAKIL_DEKAN',
};

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

const ROLE_PRIORITY: UserRole[] = ['ADMIN', 'WAKIL_DEKAN', 'KAPRODI', 'DOSEN', 'PEMBIMBING_LAPANGAN', 'MAHASISWA'];

export class AuthService {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private userRepo: UserRepository,
    private authSessionRepo: AuthSessionRepository,
    private config: AppConfig
  ) {}

  get sessionCookieName(): string {
    return this.config.authSession.cookieName;
  }

  get sessionTtlSeconds(): number {
    const ttl = Number.isFinite(this.config.authSession.ttlSeconds)
      ? this.config.authSession.ttlSeconds
      : 43200;

    return ttl > 0 ? ttl : 43200;
  }

  get sessionCookieSecure(): boolean {
    return this.config.authSession.cookieSecure;
  }

  get sessionCookieSameSite(): 'Lax' | 'Strict' | 'None' {
    return this.config.authSession.cookieSameSite;
  }

  get ssoRedirectUri(): string {
    return this.config.sso.redirectUri;
  }

  private getJwks() {
    if (!this.jwks) {
      this.assertSsoConfiguration();
      this.jwks = createRemoteJWKSet(new URL(this.config.sso.jwksUrl));
    }

    return this.jwks;
  }

  private assertSsoConfiguration() {
    const requiredConfig: Array<{ key: string; value: string }> = [
      { key: 'SSO_BASE_URL', value: this.config.sso.baseUrl },
      { key: 'SSO_ISSUER', value: this.config.sso.issuer },
      { key: 'SSO_JWKS_URL', value: this.config.sso.jwksUrl },
      { key: 'SSO_CLIENT_ID', value: this.config.sso.clientId },
      { key: 'SSO_CLIENT_SECRET', value: this.config.sso.clientSecret },
      { key: 'SSO_REDIRECT_URI', value: this.config.sso.redirectUri },
    ];

    const missing = requiredConfig.filter((item) => !item.value || !item.value.trim());

    if (missing.length > 0) {
      const error = new Error(`Missing required SSO configuration: ${missing.map((item) => item.key).join(', ')}`) as Error & { statusCode?: number };
      error.statusCode = 500;
      throw error;
    }

    if (!this.config.sso.redirectUri.endsWith('/callback')) {
      const error = new Error('SSO_REDIRECT_URI must end with /callback') as Error & { statusCode?: number };
      error.statusCode = 500;
      throw error;
    }
  }

  private parseRole(input?: string | null): UserRole {
    if (!input) {
      return 'MAHASISWA';
    }

    const normalized = input.toUpperCase().replace(/[\s-]/g, '_');
    return SSO_ROLE_MAP[normalized] || 'MAHASISWA';
  }

  private pickPrimaryRole(roles: UserRole[]): UserRole {
    for (const role of ROLE_PRIORITY) {
      if (roles.includes(role)) {
        return role;
      }
    }

    return 'MAHASISWA';
  }

  private normalizeIdentity(rawIdentity: any): AuthIdentity | null {
    if (!rawIdentity || typeof rawIdentity !== 'object') {
      return null;
    }

    const identityType = String(
      rawIdentity.identityType || rawIdentity.type || rawIdentity.identity || rawIdentity.role || rawIdentity.roleName || ''
    )
      .trim()
      .toUpperCase();

    const roleNameRaw = String(rawIdentity.roleName || rawIdentity.role || identityType || '').trim();
    const roleName = this.parseRole(roleNameRaw);

    if (!identityType) {
      return null;
    }

    return {
      identityType,
      roleName,
      identityId: rawIdentity.identityId || rawIdentity.id || null,
      displayName: rawIdentity.displayName || rawIdentity.name || null,
      identifier: rawIdentity.identifier || rawIdentity.nim || rawIdentity.nip || rawIdentity.email || null,
      metadata: rawIdentity,
    };
  }

  private uniqueIdentities(identities: AuthIdentity[]): AuthIdentity[] {
    const dedup = new Map<string, AuthIdentity>();

    for (const identity of identities) {
      const key = `${identity.identityType}|${identity.roleName}`;
      if (!dedup.has(key)) {
        dedup.set(key, identity);
      }
    }

    return Array.from(dedup.values());
  }

  private resolveAuthUserId(verifiedTokenPayload: JoseJWTPayload | null, profile: any): string {
    const candidates = [
      verifiedTokenPayload?.sub,
      profile?.sub,
      profile?.userId,
      profile?.id,
      profile?.authUserId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    const error = new Error('Unable to resolve authUserId from SSO response') as Error & { statusCode?: number };
    error.statusCode = 401;
    throw error;
  }

  private async verifyToken(token: string): Promise<JoseJWTPayload> {
    const verified = await jwtVerify(token, this.getJwks(), {
      issuer: this.config.sso.issuer,
      audience: this.config.sso.clientId,
    });

    return verified.payload;
  }

  private async exchangeAuthorizationCode(payload: CallbackPayload): Promise<TokenExchangeResponse> {
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: payload.code,
      code_verifier: payload.codeVerifier,
      redirect_uri: payload.redirectUri,
      client_id: this.config.sso.clientId,
      client_secret: this.config.sso.clientSecret,
    });

    const response = await fetch(this.config.sso.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`Failed to exchange authorization code with SSO (${response.status}): ${body}`) as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    return (await response.json()) as TokenExchangeResponse;
  }

  private extractIdentities(input: any): AuthIdentity[] {
    if (!input) {
      return [];
    }

    const identitiesRaw = Array.isArray(input)
      ? input
      : Array.isArray(input.identities)
        ? input.identities
        : Array.isArray(input.data?.identities)
          ? input.data.identities
          : [];

    return this.uniqueIdentities(
      identitiesRaw
        .map((raw: any) => this.normalizeIdentity(raw))
        .filter((identity: AuthIdentity | null): identity is AuthIdentity => Boolean(identity))
    );
  }

  private async fetchProfileAndIdentities(accessToken: string) {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };

    const profileResp = await fetch(this.config.sso.userInfoUrl, { headers });
    if (!profileResp.ok) {
      const body = await profileResp.text();
      const error = new Error(`Failed to fetch user profile from SSO (${profileResp.status}): ${body}`) as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    const profilePayload = (await profileResp.json()) as any;
    const profile = profilePayload?.data || profilePayload;

    let identities = this.extractIdentities(profilePayload);

    if (identities.length === 0) {
      const identitiesResp = await fetch(this.config.sso.identitiesUrl, { headers });

      if (identitiesResp.ok) {
        const identitiesPayload = await identitiesResp.json();
        identities = this.extractIdentities(identitiesPayload);
      }
    }

    if (identities.length === 0) {
      const fallbackIdentity = this.normalizeIdentity({
        identityType: profile?.identityType || profile?.role || 'MAHASISWA',
        roleName: profile?.role || profile?.identityType || 'MAHASISWA',
        identifier: profile?.nim || profile?.nip || profile?.email || null,
      });

      if (fallbackIdentity) {
        identities = [fallbackIdentity];
      }
    }

    return { profile, identities };
  }

  private effectiveRoles(activeIdentity: AuthIdentity | null, identities: AuthIdentity[]): UserRole[] {
    if (activeIdentity) {
      return [this.parseRole(activeIdentity.roleName)];
    }

    const roles = Array.from(new Set(identities.map((item) => this.parseRole(item.roleName))));
    return roles.length > 0 ? roles : ['MAHASISWA'];
  }

  private ensureValidCallbackPayload(payload: CallbackPayload) {
    this.assertSsoConfiguration();

    if (!payload.redirectUri.endsWith('/callback')) {
      const error = new Error('redirectUri must end with /callback') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    if (payload.redirectUri !== this.config.sso.redirectUri) {
      const error = new Error('redirectUri does not match configured SSO_REDIRECT_URI') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
  }

  buildAuthorizeUrl(state: string, codeChallenge: string, redirectUri?: string): string {
    this.assertSsoConfiguration();

    const effectiveRedirectUri = redirectUri || this.config.sso.redirectUri;
    if (effectiveRedirectUri !== this.config.sso.redirectUri) {
      const error = new Error('redirectUri does not match configured SSO_REDIRECT_URI') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const url = new URL(`${this.config.sso.baseUrl}/oauth/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.sso.clientId);
    url.searchParams.set('redirect_uri', effectiveRedirectUri);
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return url.toString();
  }

  private async loadSessionContext(sessionId: string): Promise<AuthSessionContext | null> {
    await this.authSessionRepo.deleteExpiredSessions();

    const session = await this.authSessionRepo.findSessionById(sessionId);
    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.authSessionRepo.deleteSession(sessionId);
      return null;
    }

    const user = await this.userRepo.findByAuthUserId(session.authUserId);
    if (!user || !user.isActive) {
      return null;
    }

    let availableIdentities = Array.isArray(session.availableIdentities)
      ? (session.availableIdentities as AuthIdentity[])
      : [];

    if (availableIdentities.length === 0) {
      const cacheRows = await this.authSessionRepo.getIdentityCache(session.authUserId);
      availableIdentities = cacheRows.map((row) => ({
        identityType: row.identityType,
        roleName: row.roleName,
        metadata: row.metadata as Record<string, any>,
      }));
    }

    const activeIdentity = availableIdentities.find((item) => item.identityType === session.activeIdentity) || null;
    const persistedRoles = Array.isArray(session.effectiveRoles)
      ? (session.effectiveRoles as UserRole[])
      : [];
    const effectiveRoles = persistedRoles.length > 0
      ? persistedRoles
      : this.effectiveRoles(activeIdentity, availableIdentities);
    const primaryRole = this.pickPrimaryRole(effectiveRoles.length > 0 ? effectiveRoles : [user.role]);

    const userPayload: JWTPayload = {
      userId: user.id,
      authUserId: user.authUserId,
      sessionId: session.sessionId,
      email: user.email,
      role: primaryRole,
      effectiveRoles,
      activeIdentity,
      availableIdentities,
    };

    return {
      sessionId: session.sessionId,
      authUserId: session.authUserId,
      user: userPayload,
      activeIdentity,
      availableIdentities,
      effectiveRoles,
      expiresAt: session.expiresAt,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  async handleCallback(payload: CallbackPayload, expectedState?: string | null) {
    this.ensureValidCallbackPayload(payload);

    if (!expectedState) {
      const error = new Error('Missing OAuth state verification cookie. Call /api/auth/prepare before login.') as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    if (payload.state !== expectedState) {
      const error = new Error('Invalid OAuth state') as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    const tokens = await this.exchangeAuthorizationCode(payload);

    let verifiedPayload: JoseJWTPayload | null = null;
    if (tokens.id_token) {
      verifiedPayload = await this.verifyToken(tokens.id_token);
    } else if (tokens.access_token && tokens.access_token.split('.').length === 3) {
      verifiedPayload = await this.verifyToken(tokens.access_token);
    }

    const { profile, identities } = await this.fetchProfileAndIdentities(tokens.access_token);

    if (identities.length === 0) {
      const error = new Error('No identities returned by SSO') as Error & { statusCode?: number };
      error.statusCode = 403;
      throw error;
    }

    const authUserId = this.resolveAuthUserId(verifiedPayload, profile);
    const fallbackRoles = this.effectiveRoles(null, identities);
    const localUserRole = this.pickPrimaryRole(fallbackRoles);

    const localUser = await this.userRepo.upsertFromSSO({
      authUserId,
      email: profile?.email || verifiedPayload?.email || `${authUserId}@sso.local`,
      nama: profile?.name || profile?.nama || null,
      role: localUserRole,
      authProvider: 'SSO_UNSRI',
    });

    await this.authSessionRepo.replaceIdentityCache(
      authUserId,
      identities.map((identity) => ({
        id: generateId(),
        identityType: identity.identityType,
        roleName: identity.roleName,
        metadata: identity.metadata || {},
      }))
    );

    const activeIdentity = identities.length === 1 ? identities[0] : null;
    const effectiveRoles = activeIdentity ? this.effectiveRoles(activeIdentity, identities) : [];

    const sessionId = generateId();
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

    await this.authSessionRepo.createSession({
      sessionId,
      authUserId,
      activeIdentity: activeIdentity?.identityType || null,
      effectiveRoles,
      availableIdentities: identities,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      idToken: tokens.id_token || null,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (activeIdentity) {
      await this.userRepo.update(localUser.id, {
        role: this.pickPrimaryRole(effectiveRoles),
      });
    }

    console.info('[AUTH][SSO_CALLBACK]', {
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
    };
  }

  async getSessionContext(sessionId: string): Promise<AuthSessionContext | null> {
    return this.loadSessionContext(sessionId);
  }

  async getIdentities(sessionId: string): Promise<AuthIdentity[]> {
    const sessionContext = await this.loadSessionContext(sessionId);
    if (!sessionContext) {
      const error = new Error('Session not found or expired') as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    return sessionContext.availableIdentities;
  }

  async selectIdentity(sessionId: string, identityType: string) {
    const sessionContext = await this.loadSessionContext(sessionId);
    if (!sessionContext) {
      const error = new Error('Session not found or expired') as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    const selectedIdentity = sessionContext.availableIdentities.find(
      (identity) => identity.identityType.toUpperCase() === identityType.toUpperCase()
    );

    if (!selectedIdentity) {
      const error = new Error('Selected identity is not available for this session') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const effectiveRoles = this.effectiveRoles(selectedIdentity, sessionContext.availableIdentities);

    await this.authSessionRepo.updateSession(sessionId, {
      activeIdentity: selectedIdentity.identityType,
      effectiveRoles,
    });

    const user = await this.userRepo.findByAuthUserId(sessionContext.authUserId);
    if (user) {
      await this.userRepo.update(user.id, {
        role: this.pickPrimaryRole(effectiveRoles),
      });
    }

    console.info('[AUTH][IDENTITY_SELECTED]', {
      authUserId: sessionContext.authUserId,
      sessionId,
      identityType: selectedIdentity.identityType,
      effectiveRoles,
    });

    return {
      activeIdentity: selectedIdentity,
      effectiveRoles,
    };
  }

  async getMe(sessionId: string) {
    const sessionContext = await this.loadSessionContext(sessionId);
    if (!sessionContext) {
      const error = new Error('Session not found or expired') as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    const user = await this.userRepo.findByAuthUserId(sessionContext.authUserId);
    if (!user) {
      const error = new Error('User not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    return {
      user: {
        id: user.id,
        authUserId: user.authUserId,
        authProvider: user.authProvider,
        nama: user.nama,
        email: user.email,
        role: sessionContext.user.role,
        isActive: user.isActive,
      },
      activeIdentity: sessionContext.activeIdentity,
      availableIdentities: sessionContext.availableIdentities,
      effectiveRoles: sessionContext.effectiveRoles,
    };
  }

  async authenticateSession(sessionId: string): Promise<JWTPayload> {
    const sessionContext = await this.loadSessionContext(sessionId);
    if (!sessionContext) {
      const error = new Error('Session not found or expired') as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    return sessionContext.user;
  }

  async getSessionAccessToken(sessionId: string): Promise<string> {
    const sessionContext = await this.loadSessionContext(sessionId);
    if (!sessionContext) {
      const error = new Error('Session not found or expired') as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    if (!sessionContext.accessToken) {
      const error = new Error('Session access token is not available') as Error & { statusCode?: number };
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
          client_id: this.config.sso.clientId,
          client_secret: this.config.sso.clientSecret,
        });

        await fetch(this.config.sso.revokeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: revokeBody.toString(),
        });
      } catch (error) {
        console.warn('Failed to revoke SSO refresh token during logout:', error);
      }
    }

    await this.authSessionRepo.deleteSession(sessionId);

    console.info('[AUTH][LOGOUT]', {
      sessionId,
      authUserId: session?.authUserId || null,
    });
  }

  async registerMahasiswa() {
    const error = new Error('Local registration has been disabled. Please login via SSO UNSRI.') as Error & { statusCode?: number };
    error.statusCode = 410;
    throw error;
  }

  async registerAdmin() {
    const error = new Error('Local registration has been disabled. Please login via SSO UNSRI.') as Error & { statusCode?: number };
    error.statusCode = 410;
    throw error;
  }

  async registerDosen() {
    const error = new Error('Local registration has been disabled. Please login via SSO UNSRI.') as Error & { statusCode?: number };
    error.statusCode = 410;
    throw error;
  }

  async login() {
    const error = new Error('Local login has been disabled. Please login via SSO UNSRI.') as Error & { statusCode?: number };
    error.statusCode = 410;
    throw error;
  }
}
