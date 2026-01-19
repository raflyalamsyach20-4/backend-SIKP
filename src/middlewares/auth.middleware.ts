import { Context, Next } from 'hono';
import { verify } from 'jsonwebtoken';
import type { JWTPayload, UserRole } from '@/types';

export interface AuthContext {
  user: JWTPayload;
}

export const authMiddleware = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Unauthorized: No token provided' }, 401);
    }

    const token = authHeader.substring(7);
    const jwtSecret = c.env.JWT_SECRET;

    if (!jwtSecret) {
      return c.json({ success: false, message: 'Server configuration error' }, 500);
    }

    const decoded = verify(token, jwtSecret) as JWTPayload;
    
    // Store user info in context
    c.set('user', decoded);
    
    await next();
  } catch (error) {
    return c.json({ success: false, message: 'Unauthorized: Invalid token' }, 401);
  }
};

export const roleMiddleware = (allowedRoles: UserRole[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as JWTPayload;
    
    if (!user) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json({ success: false, message: 'Forbidden: Insufficient permissions' }, 403);
    }

    await next();
  };
};

// Helper middleware untuk role spesifik
export const mahasiswaOnly = roleMiddleware(['MAHASISWA']);
export const adminOnly = roleMiddleware(['ADMIN', 'KAPRODI', 'WAKIL_DEKAN']);
export const dosenOnly = roleMiddleware(['DOSEN']);
export const staffOnly = roleMiddleware(['ADMIN', 'KAPRODI', 'WAKIL_DEKAN', 'DOSEN']);
