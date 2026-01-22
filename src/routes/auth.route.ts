import { Hono } from 'hono';
import { AuthController } from '@/controllers/auth.controller';
import { authMiddleware } from '@/middlewares/auth.middleware';

export const createAuthRoutes = (authController: AuthController) => {
  const auth = new Hono();

  // SSO Integration: login/register handled by Auth Service
  // Only expose 'me' endpoint for getting current user info
  auth.get('/me', authMiddleware(), authController.me);

  return auth;
};
