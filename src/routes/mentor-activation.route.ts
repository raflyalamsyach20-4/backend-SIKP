import { Hono } from 'hono';

export const createMentorActivationRoutes = () => {
  return new Hono<{ Bindings: CloudflareBindings }>();
};
