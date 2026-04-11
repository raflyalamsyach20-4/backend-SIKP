import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import type { JWTPayload, UserRole } from '@/types';
import { DIContainer } from '@/core';

export interface AuthContext {
  user: JWTPayload;
  sessionId: string;
}

const getSessionIdFromRequest = (c: Context): string | null => {
  const cookieName = c.env.AUTH_SESSION_COOKIE_NAME || 'sikp_session';
  const cookieSession = getCookie(c, cookieName);

  if (cookieSession) {
    return cookieSession;
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring(7).trim() || null;
};

export const authMiddleware = async (c: Context, next: Next) => {
  try {
    const sessionId = getSessionIdFromRequest(c);
    if (!sessionId) {
      return c.json({ success: false, message: 'Unauthorized: No active session found' }, 401);
    }

    const container = c.get('container') as DIContainer;
    if (!container) {
      return c.json({ success: false, message: 'Server configuration error' }, 500);
    }

    const user = await container.authService.authenticateSession(sessionId);

    const isAuthNamespaceRoute = c.req.path.startsWith('/api/auth/');
    if (!isAuthNamespaceRoute && !user.activeIdentity) {
      return c.json({ success: false, message: 'Identity selection is required before accessing this endpoint' }, 403);
    }

    c.set('user', user);
    c.set('sessionId', sessionId);

    await next();
  } catch (error) {
    return c.json({ success: false, message: 'Unauthorized: Invalid or expired session' }, 401);
  }
};

export const roleMiddleware = (allowedRoles: UserRole[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as JWTPayload;
    
    if (!user) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    const effectiveRoles = user.effectiveRoles && user.effectiveRoles.length > 0
      ? user.effectiveRoles
      : [];

    if (effectiveRoles.length === 0) {
      return c.json({ success: false, message: 'Forbidden: Missing effective roles in auth context' }, 403);
    }

    const allowed = allowedRoles.some((role) => effectiveRoles.includes(role));
    if (!allowed) {
      return c.json({ success: false, message: 'Forbidden: Insufficient permissions' }, 403);
    }

    await next();
  };
};

export const permissionMiddleware = (requiredPermissions: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as JWTPayload;

    if (!user) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    const effectivePermissions = user.effectivePermissions && user.effectivePermissions.length > 0
      ? user.effectivePermissions
      : [];

    if (effectivePermissions.length === 0) {
      return c.json({ success: false, message: 'Forbidden: Missing effective permissions in auth context' }, 403);
    }

    const allowed = requiredPermissions.some((permission) => effectivePermissions.includes(permission));
    if (!allowed) {
      return c.json({ success: false, message: 'Forbidden: Missing required permission' }, 403);
    }

    await next();
  };
};

// Helper middleware untuk role spesifik
export const mahasiswaOnly = roleMiddleware(['MAHASISWA']);
export const adminOnly = roleMiddleware(['ADMIN', 'KAPRODI', 'WAKIL_DEKAN']);
export const dosenOnly = roleMiddleware(['DOSEN']);
export const staffOnly = roleMiddleware(['ADMIN', 'KAPRODI', 'WAKIL_DEKAN', 'DOSEN']);
