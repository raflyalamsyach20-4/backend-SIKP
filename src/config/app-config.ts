/**
 * Application configuration interface
 */
export interface AppConfig {
  database: {
    url: string;
  };
  jwt: {
    secret: string;
  };
  sso: {
    baseUrl: string;
    issuer: string;
    jwksUrl: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    profileUrl: string;
    profileSignatureUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    identitiesUrl: string;
    revokeUrl: string;
    signaturePath: string;
    proxyTimeoutMs: number;
  };
  authSession: {
    ttlSeconds: number;
    cookieName: string;
    cookieSecure: boolean;
    cookieSameSite: 'Lax' | 'Strict' | 'None';
  };
  storage: {
    r2Bucket: R2Bucket | any;
    r2Domain: string;
    r2BucketName: string;
    apiBaseUrl: string;
    useMockR2: boolean;
  };
}

/**
 * Environment bindings for Cloudflare Workers
 */
export interface CloudflareBindings {
  DATABASE_URL: string;
  JWT_SECRET: string;
  R2_BUCKET: R2Bucket;
  R2_DOMAIN: string;
  R2_BUCKET_NAME: string;
  API_BASE_URL?: string;
  USE_MOCK_R2?: string | boolean;

  // SSO UNSRI
  SSO_BASE_URL?: string;
  SSO_ISSUER?: string;
  SSO_JWKS_URL?: string;
  SSO_CLIENT_ID?: string;
  SSO_CLIENT_SECRET?: string;
  SSO_REDIRECT_URI?: string;
  SSO_PROFILE_URL?: string;
  SSO_PROFILE_SIGNATURE_URL?: string;

  // Optional overrides for SSO gateway endpoints
  SSO_TOKEN_URL?: string;
  SSO_USERINFO_URL?: string;
  SSO_IDENTITIES_URL?: string;
  SSO_REVOKE_URL?: string;

  // Session
  AUTH_SESSION_TTL_SECONDS?: string;
  AUTH_COOKIE_SECURE?: string | boolean;
  AUTH_COOKIE_SAMESITE?: string;
  AUTH_SESSION_COOKIE_NAME?: string;

  // SSO proxy signature endpoint settings
  SSO_SIGNATURE_PATH?: string;
  SSO_PROXY_TIMEOUT_MS?: string;
}

/**
 * Create application configuration from environment bindings
 */
export const createAppConfig = (env: CloudflareBindings): AppConfig => {
  const useMockR2 = env.USE_MOCK_R2 === true || env.USE_MOCK_R2 === 'true';
  const ssoBaseUrl = (env.SSO_BASE_URL || '').replace(/\/$/, '');
  const ssoSameSiteRaw = (env.AUTH_COOKIE_SAMESITE || 'Lax').toString().toLowerCase();
  const cookieSameSite: 'Lax' | 'Strict' | 'None' =
    ssoSameSiteRaw === 'strict'
      ? 'Strict'
      : ssoSameSiteRaw === 'none'
        ? 'None'
        : 'Lax';
  const ssoSignaturePath = env.SSO_SIGNATURE_PATH || '/signature';
  
  return {
    database: {
      url: env.DATABASE_URL,
    },
    jwt: {
      secret: env.JWT_SECRET,
    },
    sso: {
      baseUrl: ssoBaseUrl,
      issuer: env.SSO_ISSUER || '',
      jwksUrl: env.SSO_JWKS_URL || `${ssoBaseUrl}/.well-known/jwks.json`,
      clientId: env.SSO_CLIENT_ID || '',
      clientSecret: env.SSO_CLIENT_SECRET || '',
      redirectUri: env.SSO_REDIRECT_URI || '',
      profileUrl: env.SSO_PROFILE_URL || '',
      profileSignatureUrl: env.SSO_PROFILE_SIGNATURE_URL || '',
      tokenUrl: env.SSO_TOKEN_URL || `${ssoBaseUrl}/oauth/token`,
      userInfoUrl: env.SSO_USERINFO_URL || `${ssoBaseUrl}/oauth/userinfo`,
      identitiesUrl: env.SSO_IDENTITIES_URL || `${ssoBaseUrl}/oauth/identities`,
      revokeUrl: env.SSO_REVOKE_URL || `${ssoBaseUrl}/oauth/revoke`,
      signaturePath: ssoSignaturePath.startsWith('/') ? ssoSignaturePath : `/${ssoSignaturePath}`,
      proxyTimeoutMs: Number.parseInt(env.SSO_PROXY_TIMEOUT_MS || '10000', 10),
    },
    authSession: {
      ttlSeconds: Number.parseInt(env.AUTH_SESSION_TTL_SECONDS || '43200', 10),
      cookieName: env.AUTH_SESSION_COOKIE_NAME || 'sikp_session',
      cookieSecure: env.AUTH_COOKIE_SECURE === true || env.AUTH_COOKIE_SECURE === 'true',
      cookieSameSite,
    },
    storage: {
      r2Bucket: env.R2_BUCKET,
      r2Domain: env.R2_DOMAIN,
      r2BucketName: env.R2_BUCKET_NAME,
      apiBaseUrl: env.API_BASE_URL || 'https://backend-sikp.backend-sikp.workers.dev',
      useMockR2,
    },
  };
};
