import { nanoid } from 'nanoid';

/**
 * Mock R2Bucket untuk local development
 * Saat production (Cloudflare Workers), menggunakan R2 binding yang sebenarnya
 */
export class MockR2Bucket {
  constructor(private bucketName: string) {}

  async put(key: string, data: File | Buffer | ReadableStream<Uint8Array>, options?: any) {
    console.log(`[MockR2Bucket] 📝 Mock upload: ${key}`);
    console.log(`[MockR2Bucket] ⚠️  This is a MOCK. Files are NOT actually saved to R2.`);
    console.log(`[MockR2Bucket] 💡 To test file upload, deploy to Cloudflare: npx wrangler deploy`);
    
    return {
      key,
      version: nanoid(),
      size: 0,
      etag: nanoid(),
      httpEtag: nanoid(),
      uploaded: new Date(),
      httpMetadata: options?.httpMetadata || {},
    };
  }

  async get(key: string) {
    console.log(`[MockR2Bucket] 🔍 Mock get: ${key}`);
    return null;
  }

  async delete(key: string) {
    console.log(`[MockR2Bucket] 🗑️  Mock delete: ${key}`);
  }

  async list(options?: any) {
    console.log(`[MockR2Bucket] 📋 Mock list`);
    return { objects: [] };
  }

  async head(key: string) {
    console.log(`[MockR2Bucket] 🔍 Mock head: ${key}`);
    return null;
  }
}
