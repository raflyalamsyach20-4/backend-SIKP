import { Hono } from 'hono';
import type { CloudflareBindings } from '@/config';

export const createMentorActivationRoutes = () => {
  return new Hono<{ Bindings: CloudflareBindings }>();
};
