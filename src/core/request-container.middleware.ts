import type { Context, Next } from 'hono';
import { createAppConfig, type CloudflareBindings } from '@/config';
import { createDIContainer, type DIContainer } from './di-container';

type Variables = {
  container: DIContainer;
};

export const requestContainerMiddleware = async (
  c: Context<{ Bindings: CloudflareBindings; Variables: Variables }>,
  next: Next
) => {
  const config = createAppConfig(c.env);
  const container = createDIContainer(config);
  c.set('container', container);

  await next();
};