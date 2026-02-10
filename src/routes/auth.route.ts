import { Hono } from 'hono';
import { AuthController } from '@/controllers/auth.controller';
import { authMiddleware } from '@/middlewares/auth.middleware';

export const createAuthRoutes = (authController: AuthController) => {
  const auth = new Hono();

  // OAuth 2.0 endpoints
  auth.post('/exchange', authController.exchange); // Exchange authorization code for token
  auth.post('/refresh', authController.refresh);   // Refresh access token

  // User profile endpoint (requires authentication)
  auth.get('/me', authMiddleware(), authController.me);

  return auth;
};
