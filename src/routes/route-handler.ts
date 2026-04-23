import type { Context } from 'hono';
import type { DIContainer } from '@/core';

export const withContainer = (
  handler: (container: DIContainer, c: Context) => Response | Promise<Response>
) => {
  return (c: Context) => handler(c.get('container') as DIContainer, c);
};
