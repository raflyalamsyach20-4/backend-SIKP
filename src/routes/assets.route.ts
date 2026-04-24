import { Context, Hono } from 'hono';
import type { CloudflareBindings } from '@/config';
import { zValidator } from '@hono/zod-validator';
import { emptyQuerySchema } from '@/schemas/common.schema';
import { createRuntime } from '@/runtime';

const setAssetCorsHeaders = (c: Context) => {
  const origin = c.req.header('Origin') || '*';
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Vary', 'Origin');
  c.header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  c.header('Access-Control-Expose-Headers', 'Content-Type,Content-Length,ETag');
};

const decodeSafely = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeR2Key = (rawParam: string) => {
  let candidate = decodeSafely(rawParam);
  candidate = decodeSafely(candidate).trim();

  // Support clients sending full URL instead of plain key.
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      candidate = decodeSafely(url.pathname.replace(/^\/+/, ''));
    } catch {
      // Keep original candidate if URL parsing fails.
    }
  }

  const idx = candidate.indexOf('esignatures/');
  if (idx >= 0) {
    candidate = candidate.slice(idx);
  }

  return candidate.replace(/^\/+/, '');
};

export const createAssetRoutes = () => {
  const routes = new Hono<{ Bindings: CloudflareBindings }>()
    .options('/r2/*', zValidator('query', emptyQuerySchema), (c: Context) => {
      setAssetCorsHeaders(c);
      return c.body(null, 204);
    })
    .get('/r2/*', zValidator('query', emptyQuerySchema), async (c: Context) => {
      setAssetCorsHeaders(c);

      const runtime = createRuntime(c.env);
      const pathname = new URL(c.req.url).pathname;
      const marker = '/api/assets/r2/';
      const markerIndex = pathname.indexOf(marker);
      const rawPathPart = markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : '';
      const objectKey = normalizeR2Key(rawPathPart);

      if (!objectKey.startsWith('esignatures/')) {
        return c.json({ success: false, message: 'Forbidden asset path' }, 403);
      }

      const object = await runtime.storageService.getFile(objectKey);

      if (!object) {
        return c.json({ success: false, message: 'Asset not found' }, 404);
      }

      const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
      const etag = object.httpEtag;

      c.header('Content-Type', contentType);
      c.header('Cache-Control', 'public, max-age=3600');
      if (etag) {
        c.header('ETag', etag);
      }

      return new Response(object.body, { status: 200, headers: c.res.headers });
    });

  return routes;
};
