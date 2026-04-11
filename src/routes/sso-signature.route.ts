import { Hono, Context } from 'hono';
import { DIContainer } from '@/core';
import { authMiddleware } from '@/middlewares/auth.middleware';
import { CloudflareBindings } from '@/config';

type Variables = {
  container: DIContainer;
};

export const createSsoSignatureRoutes = () => {
  const profile = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

  profile.use('*', authMiddleware);

  profile.get('/manage-url', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.ssoSignatureController.getManageProfileUrl(c);
  });

  profile.get('/signature/manage-url', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.ssoSignatureController.getManageSignatureUrl(c);
  });

  profile.get('/signature', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.ssoSignatureController.getActive(c);
  });

  profile.post('/signature', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.ssoSignatureController.upload(c);
  });

  profile.post('/signature/:id/activate', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.ssoSignatureController.activate(c);
  });

  profile.delete('/signature/:id', async (c: Context) => {
    const container = c.get('container') as DIContainer;
    return container.ssoSignatureController.remove(c);
  });

  return profile;
};
