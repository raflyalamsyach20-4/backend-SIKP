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
  EffectivePermission,
  JWTPayload,
  UserRole,
} from "@/types";
import { generateId } from "@/utils/helpers";

const SSO_ROLE_MAP: Record<string, UserRole> = {
  MAHASISWA: "MAHASISWA",
  DOSEN: "DOSEN",
  ADMIN: "ADMIN",
  MENTOR: "MENTOR",
  PEMBIMBING_LAPANGAN: "MENTOR",
  KAPRODI: "KAPRODI",
  WAKIL_DEKAN: "WAKIL_DEKAN",
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

type SsoReferenceEntity = {
  id?: string | null;
  kode?: string | null;
  nama?: string | null;
  fakultasId?: string | null;
};

type SsoRoleEntry = {
  role?: string | null;
  id?: string | null;
  profileId?: string | null;
  fakultasId?: string | null;
  prodiId?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  prodi?: SsoReferenceEntity | null;
  fakultas?: SsoReferenceEntity | null;
};

type SsoIdentityObject = {
  identityType?: string | null;
  type?: string | null;
  identity?: string | null;
  role?: string | null;
  roleName?: string | null;
  permissions?: unknown;
  permission?: unknown;
  scopes?: unknown;
  scope?: unknown;
  effectiveRoles?: unknown;
  identityId?: string | null;
  id?: string | null;
  displayName?: string | null;
  fullName?: string | null;
  name?: string | null;
  identifier?: string | null;
  nim?: string | null;
  nip?: string | null;
  nidn?: string | null;
  email?: string | null;
  phone?: string | null;
  noTelepon?: string | null;
  instansi?: string | null;
  jabatan?: string | null;
  jabatanFungsional?: string | null;
  jabatanStruktural?: string[] | null;
  bidang?: string | null;
  bidangKeahlian?: string | null;
  angkatan?: number | null;
  semester?: number | null;
  semesterAktif?: number | null;
  jumlahSksLulus?: number | null;
  status?: string | null;
  authUserId?: string | null;
  profileId?: string | null;
  dosenPAProfileId?: string | null;
  prodiId?: string | null;
  fakultasId?: string | null;
  prodi?: SsoReferenceEntity | null;
  fakultas?: SsoReferenceEntity | null;
  dosenPA?: {
    id?: string | null;
    profileId?: string | null;
    nidn?: string | null;
    profile?: {
      id?: string | null;
      fullName?: string | null;
      email?: string | null;
    } | null;
  } | null;
  profile?: SsoProfile | null;
  roleMeta?: SsoRoleEntry | null;
};

type SsoProfile = {
  id?: string | null;
  sub?: string | null;
  userId?: string | null;
  authUserId?: string | null;
  fullName?: string | null;
  nama?: string | null;
  email?: string | null;
  phone?: string | null;
  noTelepon?: string | null;
  role?: string | null;
  identityType?: string | null;
  identities?: Record<string, SsoIdentityObject | null> | null;
  roles?: Array<SsoRoleEntry | string> | null;
  nim?: string | null;
  nip?: string | null;
  nidn?: string | null;
  jabatan?: string | null;
  jabatanFungsional?: string | null;
  jabatanStruktural?: string[] | null;
  angkatan?: number | null;
  semester?: number | null;
  semesterAktif?: number | null;
  jumlahSksLulus?: number | null;
  prodi?: SsoReferenceEntity | null;
  fakultas?: SsoReferenceEntity | null;
};

type SsoEnvelope = {
  data?:
    | {
        profile?: SsoProfile | null;
        identities?: unknown;
      }
    | SsoProfile
    | null;
  profile?: SsoProfile | null;
  identities?: unknown;
};

type SsoAccessTokenPayload = JoseJWTPayload & {
  scope?: string[];
  roles?: string[];
  permissions?: string[];
};

const ROLE_PRIORITY: UserRole[] = [
  "ADMIN",
  "WAKIL_DEKAN",
  "KAPRODI",
  "DOSEN",
  "MENTOR",
  "MAHASISWA",
];
const BLOCKED_ONLY_SSO_ROLES = new Set(["USER", "SUPERADMIN"]);
type IdentityRole = "MAHASISWA" | "DOSEN" | "ADMIN" | "MENTOR";

export class AuthService {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private authSessionRepo: AuthSessionRepository,
    private config: AppConfig,
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

  get sessionCookieSameSite(): "Lax" | "Strict" | "None" {
    return this.config.authSession.cookieSameSite;
  }

  get ssoRedirectUri(): string {
    return this.config.sso.redirectUri;
  }

  get ssoProfileUrl(): string {
    if (!this.config.sso.profileUrl) {
      const error = new Error("SSO_PROFILE_URL is not configured") as Error & {
        statusCode?: number;
      };
      error.statusCode = 500;
      throw error;
    }

    return this.config.sso.profileUrl;
  }

  get ssoProfileSignatureUrl(): string {
    if (!this.config.sso.profileSignatureUrl) {
      const error = new Error(
        "SSO_PROFILE_SIGNATURE_URL is not configured",
      ) as Error & { statusCode?: number };
      error.statusCode = 500;
      throw error;
    }

    return this.config.sso.profileSignatureUrl;
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
      { key: "SSO_BASE_URL", value: this.config.sso.baseUrl },
      { key: "SSO_ISSUER", value: this.config.sso.issuer },
      { key: "SSO_JWKS_URL", value: this.config.sso.jwksUrl },
      { key: "SSO_CLIENT_ID", value: this.config.sso.clientId },
      { key: "SSO_CLIENT_SECRET", value: this.config.sso.clientSecret },
      { key: "SSO_REDIRECT_URI", value: this.config.sso.redirectUri },
      { key: "SSO_PROFILE_URL", value: this.config.sso.profileUrl },
      {
        key: "SSO_PROFILE_SIGNATURE_URL",
        value: this.config.sso.profileSignatureUrl,
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

    if (!this.config.sso.redirectUri.endsWith("/callback")) {
      const error = new Error(
        "SSO_REDIRECT_URI must end with /callback",
      ) as Error & { statusCode?: number };
      error.statusCode = 500;
      throw error;
    }
  }

  private parseRole(input?: string | null): UserRole {
    const resolved = this.parseRoleOrNull(input);
    if (resolved) {
      return resolved;
    }

    throw new Error(`Unhandled role: ${input}`);
  }

  private parseRoleOrNull(input?: string | null): UserRole | null {
    if (!input) {
      return null;
    }

    const normalized = input.toUpperCase().replace(/[\s-]/g, "_");
    return SSO_ROLE_MAP[normalized] || null;
  }

  private mapRoleToIdentityRole(role: UserRole): UserRole {
    if (role === "DOSEN" || role === "KAPRODI" || role === "WAKIL_DEKAN") {
      return "DOSEN";
    }

    if (role === "MENTOR") {
      return "MENTOR";
    }

    if (role === "ADMIN") {
      return "ADMIN";
    }

    if (role === "MAHASISWA") {
      return "MAHASISWA";
    }

    throw new Error(`Unhandled role: ${role}`);
  }

  private normalizeRawRoleTag(input: unknown): string | null {
    if (typeof input !== "string") {
      return null;
    }

    const normalized = input.trim().toUpperCase().replace(/[\s-]/g, "_");
    return normalized.length > 0 ? normalized : null;
  }

  private extractRawSsoRoleTags(
    profile: SsoProfile | null,
    accessTokenPayload: SsoAccessTokenPayload | null,
  ): string[] {
    const tags = new Set<string>();

    const pushTag = (value: unknown) => {
      const normalized = this.normalizeRawRoleTag(value);
      if (normalized) {
        tags.add(normalized);
      }
    };

    const profileRoles = Array.isArray(profile?.roles) ? profile.roles : [];
    for (const roleEntry of profileRoles) {
      if (roleEntry && typeof roleEntry === "object") {
        pushTag(roleEntry.role);
      } else {
        pushTag(roleEntry);
      }
    }

    pushTag(profile?.role);

    const tokenRoleCandidates: unknown[] = [accessTokenPayload?.roles];

    for (const candidate of tokenRoleCandidates) {
      if (Array.isArray(candidate)) {
        for (const role of candidate) {
          pushTag(role);
        }
        continue;
      }

      pushTag(candidate);
    }

    return Array.from(tags);
  }

  private isBlockedOnlySsoRoleSet(rawRoleTags: string[]): boolean {
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

  private collectIdentityRoles(identity: AuthIdentity): UserRole[] {
    const roles = new Set<UserRole>();

    const roleFromName = this.parseRoleOrNull(identity.roleName);
    if (roleFromName) {
      roles.add(roleFromName);
    }

    const roleFromIdentityType = this.parseRoleOrNull(identity.identityType);
    if (roleFromIdentityType) {
      roles.add(roleFromIdentityType);
    }

    const metadataRoles = Array.isArray(identity.metadata?.effectiveRoles)
      ? identity.metadata?.effectiveRoles
      : [];

    for (const rawRole of metadataRoles) {
      const parsed = this.parseRoleOrNull(String(rawRole));
      if (parsed) {
        roles.add(parsed);
      }
    }

    return Array.from(roles);
  }

  private withIdentityRoles(
    identity: AuthIdentity,
    roles: UserRole[],
  ): AuthIdentity {
    const mergedRoles = Array.from(
      new Set([...this.collectIdentityRoles(identity), ...roles]),
    );

    return {
      ...identity,
      metadata: {
        ...(identity.metadata || {}),
        effectiveRoles: mergedRoles,
      },
    };
  }

  private pickPrimaryRole(roles: UserRole[]): UserRole {
    for (const role of ROLE_PRIORITY) {
      if (roles.includes(role)) {
        return role;
      }
    }

    throw new Error(`Unhandled role: ${roles}`);
  }

  private normalizeIdentity(
    rawIdentity: SsoIdentityObject | null,
  ): AuthIdentity | null {
    if (!rawIdentity || typeof rawIdentity !== "object") {
      return null;
    }

    const identityTypeRaw = this.parseRoleOrNull(
      String(
        rawIdentity.identityType ||
          rawIdentity.type ||
          rawIdentity.identity ||
          rawIdentity.role ||
          rawIdentity.roleName ||
          "",
      ),
    );

    const roleNameRaw = this.parseRoleOrNull(
      String(rawIdentity.roleName || rawIdentity.role || ""),
    );
    const resolvedRole = roleNameRaw || identityTypeRaw;

    if (!resolvedRole) {
      return null;
    }

    const identityRole = this.mapRoleToIdentityRole(
      identityTypeRaw || resolvedRole,
    );
    const roleName = this.mapRoleToIdentityRole(roleNameRaw || resolvedRole);

    const permissions = this.normalizePermissions(
      rawIdentity.permissions ||
        rawIdentity.permission ||
        rawIdentity.scopes ||
        rawIdentity.scope,
    );

    const identityRoles = Array.from(
      new Set([
        resolvedRole,
        ...(Array.isArray(rawIdentity.effectiveRoles)
          ? rawIdentity.effectiveRoles
              .map((item: unknown) => this.parseRoleOrNull(String(item)))
              .filter((item: UserRole | null): item is UserRole =>
                Boolean(item),
              )
          : []),
      ]),
    );

    return {
      identityType: identityRole,
      roleName,
      permissions,
      identityId: rawIdentity.identityId || rawIdentity.id || null,
      displayName:
        rawIdentity.displayName ||
        rawIdentity.fullName ||
        rawIdentity.name ||
        null,
      identifier:
        rawIdentity.identifier ||
        rawIdentity.nim ||
        rawIdentity.nip ||
        rawIdentity.email ||
        null,
      metadata: {
        ...rawIdentity,
        effectiveRoles: identityRoles,
      },
    };
  }

  private normalizePermissions(input: unknown): EffectivePermission[] {
    const toList = Array.isArray(input)
      ? input
      : typeof input === "string"
        ? input.split(/[\s,]+/)
        : [];

    const normalized = toList
      .map((item) => String(item || "").trim())
      .filter((item) => item.length > 0);

    return Array.from(new Set(normalized));
  }

  private extractTokenPermissions(
    payload: SsoAccessTokenPayload | null,
  ): EffectivePermission[] {
    if (!payload) {
      return [];
    }

    const claimsCandidates: unknown[] = [payload.permissions, payload.scope];

    for (const candidate of claimsCandidates) {
      const permissions = this.normalizePermissions(candidate);
      if (permissions.length > 0) {
        return permissions;
      }
    }

    return [];
  }

  private uniqueIdentities(identities: AuthIdentity[]): AuthIdentity[] {
    const dedup = new Map<string, AuthIdentity>();

    for (const identity of identities) {
      const key = identity.identityType.toUpperCase();
      const existing = dedup.get(key);

      if (!existing) {
        dedup.set(key, identity);
        continue;
      }

      const mergedRoles = Array.from(
        new Set([
          ...this.collectIdentityRoles(existing),
          ...this.collectIdentityRoles(identity),
        ]),
      );

      const mergedPermissions = Array.from(
        new Set([
          ...(existing.permissions || []),
          ...(identity.permissions || []),
        ]),
      );

      dedup.set(key, {
        ...existing,
        roleName: existing.roleName || identity.roleName,
        identityId: existing.identityId || identity.identityId,
        displayName: existing.displayName || identity.displayName,
        identifier: existing.identifier || identity.identifier,
        permissions: mergedPermissions,
        metadata: {
          ...(existing.metadata || {}),
          ...(identity.metadata || {}),
          effectiveRoles: mergedRoles,
        },
      });
    }

    return Array.from(dedup.values());
  }

  private resolveAuthUserId(
    verifiedTokenPayload: JoseJWTPayload | null,
    profile: SsoProfile | null,
  ): string {
    const candidates = [
      verifiedTokenPayload?.sub,
      profile?.sub,
      profile?.userId,
      profile?.authUserId,
      profile?.id,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }

    const error = new Error(
      "Unable to resolve authUserId from SSO response",
    ) as Error & { statusCode?: number };
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

  private async exchangeAuthorizationCode(
    payload: CallbackPayload,
  ): Promise<TokenExchangeResponse> {
    const form = new URLSearchParams({
      grant_type: "AUTHORIZATION_CODE",
      code: payload.code,
      code_verifier: payload.codeVerifier,
      redirect_uri: payload.redirectUri,
      client_id: this.config.sso.clientId,
      client_secret: this.config.sso.clientSecret,
    });

    const response = await fetch(this.config.sso.tokenUrl, {
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

  private extractIdentities(input: unknown): AuthIdentity[] {
    if (!input) {
      return [];
    }

    const payload = input as SsoEnvelope | SsoIdentityObject[];
    const identitiesRaw = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.identities)
        ? payload.identities
        : Array.isArray(payload.data?.identities)
          ? payload.data.identities
          : [];

    if (identitiesRaw.length > 0) {
      return this.uniqueIdentities(
        identitiesRaw
          .map((raw) => this.normalizeIdentity(raw as SsoIdentityObject))
          .filter((identity: AuthIdentity | null): identity is AuthIdentity =>
            Boolean(identity),
          ),
      );
    }

    // New SSO profile contract:
    // {
    //   success: true,
    //   data: {
    //     profile: {
    //       fullName,
    //       email,
    //       identities: { mahasiswa: {...}|null, dosen: {...}|null, ... },
    //       roles: [{ role: 'DOSEN', ... }, ...]
    //     }
    //   }
    // }
    const profile =
      (payload as SsoEnvelope)?.data &&
      typeof (payload as SsoEnvelope).data === "object" &&
      !Array.isArray((payload as SsoEnvelope).data) &&
      "profile" in ((payload as SsoEnvelope).data || {})
        ? ((payload as SsoEnvelope).data as { profile?: SsoProfile | null })
            .profile || null
        : (payload as SsoEnvelope)?.profile || null;
    if (!profile || typeof profile !== "object") {
      return [];
    }

    const normalizedFromObjectMap: AuthIdentity[] = [];
    const identityMap = profile.identities;

    if (
      identityMap &&
      typeof identityMap === "object" &&
      !Array.isArray(identityMap)
    ) {
      for (const [identityKey, identityValue] of Object.entries(identityMap)) {
        if (!identityValue || typeof identityValue !== "object") {
          continue;
        }

        const keyRole = this.parseRoleOrNull(identityKey);
        const payloadRole = this.parseRoleOrNull(
          identityValue.roleName ||
            identityValue.role ||
            identityValue.identityType,
        );
        const resolvedRole = payloadRole || keyRole;

        if (!resolvedRole) {
          continue;
        }

        const normalizedIdentity = this.normalizeIdentity({
          ...identityValue,
          identityType: this.mapRoleToIdentityRole(resolvedRole),
          roleName: this.mapRoleToIdentityRole(resolvedRole),
          effectiveRoles: [resolvedRole],
          displayName:
            identityValue.fullName ||
            profile.fullName ||
            identityValue.name ||
            null,
          identifier:
            identityValue.nim ||
            identityValue.nidn ||
            identityValue.nip ||
            identityValue.email ||
            profile.email ||
            null,
          authUserId: profile.authUserId || null,
          profileId: identityValue.profileId || profile.id || null,
          profile,
        });

        if (normalizedIdentity) {
          normalizedFromObjectMap.push(normalizedIdentity);
        }
      }
    }

    const roles = Array.isArray(profile.roles) ? profile.roles : [];
    for (const roleEntry of roles) {
      if (!roleEntry || typeof roleEntry !== "object") {
        continue;
      }

      const resolvedRole = this.parseRoleOrNull(roleEntry.role);
      if (!resolvedRole) {
        continue;
      }

      const identityBucket = this.mapRoleToIdentityRole(
        resolvedRole,
      ) as IdentityRole;
      const alreadyExists = normalizedFromObjectMap.some(
        (identity) => identity.identityType.toUpperCase() === identityBucket,
      );

      if (alreadyExists) {
        continue;
      }

      const normalizedIdentity = this.normalizeIdentity({
        identityType: identityBucket,
        roleName: identityBucket,
        effectiveRoles: [resolvedRole],
        identityId: roleEntry.id || null,
        displayName: profile.fullName || null,
        identifier: profile.email || null,
        authUserId: profile.authUserId || null,
        profile,
        roleMeta: roleEntry,
      });

      if (normalizedIdentity) {
        normalizedFromObjectMap.push(normalizedIdentity);
      }
    }

    let normalized = this.uniqueIdentities(normalizedFromObjectMap);

    if (roles.length > 0) {
      const rolesByIdentity = new Map<UserRole, Set<UserRole>>();

      for (const roleEntry of roles) {
        if (!roleEntry || typeof roleEntry !== "object") {
          continue;
        }

        const resolvedRole = this.parseRoleOrNull(roleEntry.role);
        if (!resolvedRole) {
          continue;
        }

        const identityRole = this.mapRoleToIdentityRole(resolvedRole);
        const bucket = rolesByIdentity.get(identityRole) || new Set<UserRole>();
        bucket.add(resolvedRole);
        rolesByIdentity.set(identityRole, bucket);
      }

      normalized = normalized.map((identity) => {
        const identityRole = this.parseRoleOrNull(identity.identityType);
        if (!identityRole) {
          return identity;
        }

        const mappedRoles = rolesByIdentity.get(identityRole);
        if (!mappedRoles || mappedRoles.size === 0) {
          return identity;
        }

        return this.withIdentityRoles(identity, Array.from(mappedRoles));
      });
    }

    return this.uniqueIdentities(normalized);
  }

  private async fetchProfileAndIdentities(accessToken: string) {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    const profileResp = await fetch(this.config.sso.identitiesUrl, { headers });
    if (!profileResp.ok) {
      const body = await profileResp.text();
      const error = new Error(
        `Failed to fetch user profile from SSO (${profileResp.status}): ${body}`,
      ) as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    const profilePayload = (await profileResp.json()) as SsoEnvelope;
    let profile =
      profilePayload?.data &&
      typeof profilePayload.data === "object" &&
      !Array.isArray(profilePayload.data) &&
      "profile" in profilePayload.data
        ? profilePayload.data.profile || null
        : profilePayload?.profile ||
          (profilePayload?.data &&
          typeof profilePayload.data === "object" &&
          !Array.isArray(profilePayload.data)
            ? (profilePayload.data as SsoProfile)
            : null);

    let identities = this.extractIdentities(profilePayload);

    if (
      identities.length === 0 &&
      this.config.sso.userInfoUrl !== this.config.sso.identitiesUrl
    ) {
      const userInfoResp = await fetch(this.config.sso.userInfoUrl, {
        headers,
      });
      if (userInfoResp.ok) {
        const userInfoPayload = (await userInfoResp.json()) as SsoEnvelope;
        const identitiesFromUserInfo = this.extractIdentities(userInfoPayload);
        identities = this.uniqueIdentities([
          ...identities,
          ...identitiesFromUserInfo,
        ]);

        const profileFromUserInfo =
          userInfoPayload?.data &&
          typeof userInfoPayload.data === "object" &&
          !Array.isArray(userInfoPayload.data) &&
          "profile" in userInfoPayload.data
            ? userInfoPayload.data.profile || null
            : userInfoPayload?.profile ||
              (userInfoPayload?.data &&
              typeof userInfoPayload.data === "object" &&
              !Array.isArray(userInfoPayload.data)
                ? (userInfoPayload.data as SsoProfile)
                : null);
        if (profileFromUserInfo && typeof profileFromUserInfo === "object") {
          profile = profileFromUserInfo;
        }
      }
    }

    if (identities.length === 0 && profile) {
      const fallbackRole = this.parseRoleOrNull(
        profile.identityType || profile.role || null,
      );

      if (fallbackRole) {
        const fallbackIdentity = this.normalizeIdentity({
          identityType: this.mapRoleToIdentityRole(fallbackRole),
          roleName: this.mapRoleToIdentityRole(fallbackRole),
          effectiveRoles: [fallbackRole],
          identifier: profile.nim || profile.nip || profile.email || null,
          authUserId: profile.authUserId || null,
          profile,
        });

        if (fallbackIdentity) {
          identities = [fallbackIdentity];
        }
      }
    }

    return { profile, identities };
  }

  private effectiveRoles(
    activeIdentity: AuthIdentity | null,
    identities: AuthIdentity[],
  ): UserRole[] {
    if (activeIdentity) {
      const roles = this.collectIdentityRoles(activeIdentity);
      return roles.length > 0
        ? roles
        : [this.parseRole(activeIdentity.roleName)];
    }

    const roles = Array.from(
      new Set(identities.flatMap((item) => this.collectIdentityRoles(item))),
    );
    return roles;
  }

  private getIdentityMetadataProfile(
    identity: AuthIdentity | null | undefined,
  ): SsoProfile | SsoIdentityObject | null {
    if (
      !identity?.metadata ||
      typeof identity.metadata !== "object" ||
      !("profile" in identity.metadata)
    ) {
      return null;
    }

    const metadataProfile = identity.metadata.profile;
    if (!metadataProfile || typeof metadataProfile !== "object") {
      return null;
    }

    return metadataProfile as SsoProfile | SsoIdentityObject;
  }

  private pickFirstString(
    ...values: Array<string | null | undefined>
  ): string | null {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private pickFirstNumber(
    ...values: Array<number | null | undefined>
  ): number | null {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }

    return null;
  }

  private resolveIdentityRecord(
    identity: AuthIdentity | null | undefined,
  ): SsoIdentityObject | null {
    if (!identity) {
      return null;
    }

    const metadataProfile = this.getIdentityMetadataProfile(identity);
    return metadataProfile && typeof metadataProfile === "object"
      ? (metadataProfile as SsoIdentityObject)
      : null;
  }

  private resolveIdentityDetail(identity: AuthIdentity | null | undefined) {
    const metadataProfile = this.resolveIdentityRecord(identity);

    return {
      id: this.pickFirstString(
        identity?.identityId || null,
        metadataProfile?.id || null,
        metadataProfile?.profileId || null,
      ),
      nama: this.pickFirstString(
        identity?.displayName || null,
        metadataProfile?.fullName || null,
        metadataProfile?.name || null,
        metadataProfile?.profile?.fullName || null,
      ),
      email: this.pickFirstString(
        metadataProfile?.email || null,
        metadataProfile?.profile?.email || null,
        typeof identity?.identifier === "string" &&
          identity.identifier.includes("@")
          ? identity.identifier
          : null,
      ),
      nim: this.pickFirstString(
        metadataProfile?.nim || null,
        identity?.identifier || null,
      ),
      nip: this.pickFirstString(metadataProfile?.nip || null),
      nidn: this.pickFirstString(
        metadataProfile?.nidn || null,
        metadataProfile?.dosenPA?.nidn || null,
      ),
      phone: this.pickFirstString(
        metadataProfile?.phone || null,
        metadataProfile?.noTelepon || null,
      ),
      jabatan: this.pickFirstString(
        metadataProfile?.jabatan || null,
        metadataProfile?.jabatanFungsional || null,
      ),
      jabatanFungsional: this.pickFirstString(
        metadataProfile?.jabatanFungsional || null,
      ),
      jabatanStruktural: Array.isArray(metadataProfile?.jabatanStruktural)
        ? metadataProfile.jabatanStruktural.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          )
        : null,
      angkatan: this.pickFirstNumber(metadataProfile?.angkatan || null),
      semester: this.pickFirstNumber(
        metadataProfile?.semester || null,
        metadataProfile?.semesterAktif || null,
      ),
      semesterAktif: this.pickFirstNumber(
        metadataProfile?.semesterAktif || null,
        metadataProfile?.semester || null,
      ),
      jumlahSksLulus: this.pickFirstNumber(
        metadataProfile?.jumlahSksLulus || null,
      ),
      prodi: this.pickFirstString(
        metadataProfile?.prodi?.nama || null,
        metadataProfile?.prodi?.kode || null,
      ),
      fakultas: this.pickFirstString(
        metadataProfile?.fakultas?.nama || null,
        metadataProfile?.fakultas?.kode || null,
      ),
      profile: metadataProfile,
    };
  }

  private effectivePermissions(
    activeIdentity: AuthIdentity | null,
    identities: AuthIdentity[],
    fallbackTokenPermissions: EffectivePermission[] = [],
  ): EffectivePermission[] {
    if (!activeIdentity) {
      return [];
    }

    const fromActive = this.normalizePermissions(
      activeIdentity?.permissions || activeIdentity?.metadata?.permissions,
    );
    if (fromActive.length > 0) {
      return fromActive;
    }

    const mergedFromIdentities = Array.from(
      new Set(
        identities.flatMap((identity) =>
          this.normalizePermissions(
            identity.permissions || identity.metadata?.permissions,
          ),
        ),
      ),
    );

    if (mergedFromIdentities.length > 0) {
      return mergedFromIdentities;
    }

    return this.normalizePermissions(fallbackTokenPermissions);
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

    if (payload.redirectUri !== this.config.sso.redirectUri) {
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

    const effectiveRedirectUri = redirectUri || this.config.sso.redirectUri;
    if (effectiveRedirectUri !== this.config.sso.redirectUri) {
      const error = new Error(
        "redirectUri does not match configured SSO_REDIRECT_URI",
      ) as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const url = new URL(`${this.config.sso.baseUrl}/oauth/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.sso.clientId);
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
    const availableIdentities = identities;
    const activeIdentity =
      availableIdentities.find(
        (item) => item.identityType === session.activeIdentity,
      ) || null;
    const effectiveRoles = this.effectiveRoles(
      activeIdentity,
      availableIdentities,
    );
    const effectivePermissions = this.effectivePermissions(
      activeIdentity,
      availableIdentities,
    );
    const primaryRole = this.pickPrimaryRole(effectiveRoles);
    const activeIdentityDetail = this.resolveIdentityDetail(activeIdentity);
    const inferredEmail =
      this.pickFirstString(
        activeIdentityDetail.email,
        profile && typeof profile.email === "string" ? profile.email : null,
      ) || `${session.authUserId}@sso.local`;

    const userPayload: JWTPayload = {
      userId: session.authUserId,
      authUserId: session.authUserId,
      sessionId: session.sessionId,
      email: inferredEmail,
      role: primaryRole,
      effectiveRoles,
      effectivePermissions,
      activeIdentity,
      availableIdentities,
      nim: activeIdentityDetail.nim,
      nip: activeIdentityDetail.nip,
      nidn: activeIdentityDetail.nidn,
      phone: activeIdentityDetail.phone,
      jabatan: activeIdentityDetail.jabatan,
      jabatanFungsional: activeIdentityDetail.jabatanFungsional,
      jabatanStruktural: activeIdentityDetail.jabatanStruktural,
      angkatan: activeIdentityDetail.angkatan,
      semester: activeIdentityDetail.semester,
      semesterAktif: activeIdentityDetail.semesterAktif,
      jumlahSksLulus: activeIdentityDetail.jumlahSksLulus,
      prodi: activeIdentityDetail.prodi,
      fakultas: activeIdentityDetail.fakultas,
    };

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

    const { profile, identities } = await this.fetchProfileAndIdentities(
      tokens.access_token,
    );
    const tokenPermissions = this.extractTokenPermissions(
      verifiedAccessTokenPayload || verifiedPayload,
    );

    const rawSsoRoles = this.extractRawSsoRoleTags(
      profile,
      verifiedAccessTokenPayload || verifiedPayload,
    );
    if (this.isBlockedOnlySsoRoleSet(rawSsoRoles)) {
      const error = new Error(
        "Role SSO Anda tidak diizinkan mengakses SIKP.",
      ) as Error & { statusCode?: number };
      error.statusCode = 403;
      throw error;
    }

    if (identities.length === 0) {
      const error = new Error("No identities returned by SSO") as Error & {
        statusCode?: number;
      };
      error.statusCode = 403;
      throw error;
    }

    const authUserId = this.resolveAuthUserId(verifiedPayload, profile);

    const activeIdentity = identities.length === 1 ? identities[0] : null;
    const effectiveRoles = activeIdentity
      ? this.effectiveRoles(activeIdentity, identities)
      : [];
    const effectivePermissions = activeIdentity
      ? this.effectivePermissions(activeIdentity, identities, tokenPermissions)
      : [];

    const sessionId = generateId();
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1000);

    await this.authSessionRepo.createSession({
      sessionId,
      authUserId,
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

    const effectiveRoles = this.effectiveRoles(
      selectedIdentity,
      sessionContext.availableIdentities,
    );
    const effectivePermissions = this.effectivePermissions(
      selectedIdentity,
      sessionContext.availableIdentities,
      sessionContext.effectivePermissions,
    );

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

    const fallbackIdentity =
      sessionContext.activeIdentity ||
      sessionContext.availableIdentities.find((identity) => {
        const detail = this.resolveIdentityDetail(identity);
        return Boolean(detail.nama || detail.email);
      }) ||
      null;

    const activeIdentityDetail = this.resolveIdentityDetail(
      sessionContext.activeIdentity,
    );
    const fallbackIdentityDetail = this.resolveIdentityDetail(fallbackIdentity);

    const resolvedNama = this.pickFirstString(
      activeIdentityDetail.nama,
      fallbackIdentityDetail.nama,
    );

    const resolvedEmail =
      this.pickFirstString(
        sessionContext.user.email &&
          !sessionContext.user.email.endsWith("@sso.local")
          ? sessionContext.user.email
          : null,
        activeIdentityDetail.email,
        fallbackIdentityDetail.email,
        sessionContext.user.email,
      ) || sessionContext.user.email;

    const resolvedNim = this.pickFirstString(
      sessionContext.user.nim,
      activeIdentityDetail.nim,
      fallbackIdentityDetail.nim,
    );
    const resolvedNip = this.pickFirstString(
      sessionContext.user.nip,
      activeIdentityDetail.nip,
      fallbackIdentityDetail.nip,
    );
    const resolvedNidn = this.pickFirstString(
      sessionContext.user.nidn,
      activeIdentityDetail.nidn,
      fallbackIdentityDetail.nidn,
    );
    const resolvedPhone = this.pickFirstString(
      sessionContext.user.phone,
      activeIdentityDetail.phone,
      fallbackIdentityDetail.phone,
    );
    const resolvedJabatan = this.pickFirstString(
      sessionContext.user.jabatan,
      activeIdentityDetail.jabatan,
      fallbackIdentityDetail.jabatan,
    );
    const resolvedJabatanFungsional = this.pickFirstString(
      sessionContext.user.jabatanFungsional,
      activeIdentityDetail.jabatanFungsional,
      fallbackIdentityDetail.jabatanFungsional,
    );
    const resolvedJabatanStruktural =
      sessionContext.user.jabatanStruktural &&
      sessionContext.user.jabatanStruktural.length > 0
        ? sessionContext.user.jabatanStruktural
        : activeIdentityDetail.jabatanStruktural ||
          fallbackIdentityDetail.jabatanStruktural ||
          null;
    const resolvedAngkatan =
      sessionContext.user.angkatan ??
      activeIdentityDetail.angkatan ??
      fallbackIdentityDetail.angkatan ??
      null;
    const resolvedSemester =
      sessionContext.user.semester ??
      activeIdentityDetail.semester ??
      fallbackIdentityDetail.semester ??
      null;
    const resolvedSemesterAktif =
      sessionContext.user.semesterAktif ??
      activeIdentityDetail.semesterAktif ??
      fallbackIdentityDetail.semesterAktif ??
      null;
    const resolvedJumlahSksLulus =
      sessionContext.user.jumlahSksLulus ??
      activeIdentityDetail.jumlahSksLulus ??
      fallbackIdentityDetail.jumlahSksLulus ??
      null;
    const resolvedProdi = this.pickFirstString(
      sessionContext.user.prodi,
      activeIdentityDetail.prodi,
      fallbackIdentityDetail.prodi,
    );
    const resolvedFakultas = this.pickFirstString(
      sessionContext.user.fakultas,
      activeIdentityDetail.fakultas,
      fallbackIdentityDetail.fakultas,
    );

    return {
      user: {
        id: sessionContext.user.userId,
        authUserId: sessionContext.authUserId,
        authProvider: "SSO_UNSRI",
        nama: resolvedNama,
        email: resolvedEmail,
        role: sessionContext.user.role,
        isActive: true,
        nim: resolvedNim,
        nip: resolvedNip,
        nidn: resolvedNidn,
        phone: resolvedPhone,
        jabatan: resolvedJabatan,
        jabatanFungsional: resolvedJabatanFungsional,
        jabatanStruktural: resolvedJabatanStruktural,
        angkatan: resolvedAngkatan,
        semester: resolvedSemester,
        semesterAktif: resolvedSemesterAktif,
        jumlahSksLulus: resolvedJumlahSksLulus,
        prodi: resolvedProdi,
        fakultas: resolvedFakultas,
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
          client_id: this.config.sso.clientId,
          client_secret: this.config.sso.clientSecret,
        });

        await fetch(this.config.sso.revokeUrl, {
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
