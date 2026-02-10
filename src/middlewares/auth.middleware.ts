import { Context, Next } from 'hono';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

export interface AuthContext {
  userId: string;
  email: string;
  name?: string;
  roles: string[];
  permissions: string[];
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// JWKS cache
let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(jwksUrl: string) {
  if (!JWKS) {
    JWKS = createRemoteJWKSet(new URL(jwksUrl));
  }
  return JWKS;
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      return c.json({ error: 'Unauthorized', message: 'No token provided' }, 401);
    }

    try {
      const ssoIssuer = c.env?.SSO_ISSUER;
      const ssoJwksUrl = c.env?.SSO_JWKS_URL;
      const ssoClientId = c.env?.SSO_CLIENT_ID; // This is our audience

      if (!ssoIssuer || !ssoJwksUrl || !ssoClientId) {
        console.error('Missing SSO configuration:', { ssoIssuer, ssoJwksUrl, ssoClientId });
        return c.json({ error: 'Internal Server Error', message: 'SSO not configured' }, 500);
      }

      const jwks = getJWKS(ssoJwksUrl);
      const { payload } = await jwtVerify(token, jwks, {
        issuer: ssoIssuer,
        audience: ssoClientId,
      });

      // Extract claims from JWT
      const authContext: AuthContext = {
        userId: payload.sub as string,
        email: payload.email as string,
        name: payload.name as string | undefined,
        roles: (payload.roles as string[]) || [],
        permissions: (payload.permissions as string[]) || [],
      };

      c.set('auth', authContext);
      await next();
    } catch (error) {
      console.error('JWT verification error:', error);
      return c.json({ 
        error: 'Unauthorized', 
        message: error instanceof Error ? error.message : 'Invalid or expired token' 
      }, 401);
    }
  };
}

export function optionalAuthMiddleware() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      // No token, continue without auth context
      await next();
      return;
    }

    try {
      const ssoIssuer = c.env?.SSO_ISSUER;
      const ssoJwksUrl = c.env?.SSO_JWKS_URL;
      const ssoClientId = c.env?.SSO_CLIENT_ID;

      if (!ssoIssuer || !ssoJwksUrl || !ssoClientId) {
        // Config missing, continue without auth
        await next();
        return;
      }

      const jwks = getJWKS(ssoJwksUrl);
      const { payload } = await jwtVerify(token, jwks, {
        issuer: ssoIssuer,
        audience: ssoClientId,
      });

      const authContext: AuthContext = {
        userId: payload.sub as string,
        email: payload.email as string,
        name: payload.name as string | undefined,
        roles: (payload.roles as string[]) || [],
        permissions: (payload.permissions as string[]) || [],
      };

      c.set('auth', authContext);
    } catch (error) {
      // Invalid token, continue without auth context
      console.warn('Optional auth failed:', error);
    }

    await next();
  };
}

// Permission-based authorization
export function requirePermission(...requiredPermissions: string[]) {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth');
    
    if (!auth) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const hasPermission = requiredPermissions.some(permission => 
      auth.permissions.includes(permission)
    );

    if (!hasPermission) {
      return c.json({ 
        error: 'Forbidden', 
        message: `Required permissions: ${requiredPermissions.join(' or ')}` 
      }, 403);
    }

    await next();
  };
}

// Role-based authorization
export function requireRole(...requiredRoles: string[]) {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth');
    
    if (!auth) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const hasRole = requiredRoles.some(role => auth.roles.includes(role));

    if (!hasRole) {
      return c.json({ 
        error: 'Forbidden', 
        message: `Required roles: ${requiredRoles.join(' or ')}` 
      }, 403);
    }

    await next();
  };
}

// Combined permission or role check
export function requirePermissionOrRole(permissions: string[], roles: string[]) {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth');
    
    if (!auth) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const hasPermission = permissions.some(permission => 
      auth.permissions.includes(permission)
    );
    const hasRole = roles.some(role => auth.roles.includes(role));

    if (!hasPermission && !hasRole) {
      return c.json({ 
        error: 'Forbidden', 
        message: 'Insufficient permissions or roles' 
      }, 403);
    }

    await next();
  };
}

// Helper to check if user is mahasiswa (has mahasiswa role)
export function requireMahasiswa() {
  return requireRole('mahasiswa');
}

// Helper to check if user is admin/staff
export function requireAdmin() {
  return requireRole('admin', 'superadmin');
}

// Helper to check if user is dosen
export function requireDosen() {
  return requireRole('dosen');
}

// Aliases for backwards compatibility with route files
export const mahasiswaOnly = requireMahasiswa;
export const adminOnly = requireAdmin;
export const dosenOnly = requireDosen;
