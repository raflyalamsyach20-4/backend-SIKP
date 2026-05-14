import { nanoid } from 'nanoid';
import { S3R2Storage } from './s3-r2-storage';
import { getFileSize, getUploadBody, resolveContentType, type UploadableFile } from '@/utils/file-utils';

export class StorageService {
  private r2Domain: string;
  private r2BucketName: string;
  private apiBaseUrl: string;
  private r2Bucket: R2Bucket | null;
  private s3Fallback: S3R2Storage | null = null;

  constructor(env: CloudflareBindings) {
    // Get from parameters (passed from index.ts) or fall back to environment variables
    this.r2Domain = env.R2_DOMAIN || '';
    this.r2BucketName = env.R2_BUCKET_NAME || '';
    this.apiBaseUrl = (env.API_BASE_URL || '').replace(/\/$/, '');
    this.r2Bucket = env.R2_BUCKET || null;

    // Initialize S3 fallback if credentials available (usually in local .env)
    if (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_S3_ENDPOINT) {
      this.s3Fallback = new S3R2Storage(this.r2BucketName, {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        endpoint: env.R2_S3_ENDPOINT,
      });
    }

    if (!this.r2Domain) {
      throw new Error('R2_DOMAIN is not set. Please set R2_DOMAIN in wrangler.jsonc or environment variables');
    }
    if (!this.r2BucketName) {
      throw new Error('R2_BUCKET_NAME is not set. Please set R2_BUCKET_NAME in wrangler.jsonc or environment variables');
    }
    if (!this.apiBaseUrl) {
      throw new Error('API_BASE_URL is not set. Please set API_BASE_URL in wrangler.jsonc or environment variables');
    }

    // In production, ensure R2 bucket binding exists to avoid silent mock usage
    if (!this.r2Bucket && !this.s3Fallback && process.env.NODE_ENV !== 'development') {
      throw new Error('R2_BUCKET binding is missing. Deploy to Cloudflare Workers or set USE_MOCK_R2=true for local dev');
    }
  }

  async uploadFile(
    file: UploadableFile,
    fileName: string,
    folder: string = 'documents',
    contentType?: string
  ): Promise<{ url: string; key: string }> {
    const fileKey = `${folder}/${Date.now()}-${nanoid(10)}-${fileName}`;
    
    try {
      console.log(`[StorageService] 📤 Uploading file to R2: ${fileKey}`);
      const guessedSize = getFileSize(file);
      if (guessedSize !== undefined) {
        console.log(`[StorageService] File size: ${guessedSize} bytes`);
      }
      console.log(`[StorageService] R2_BUCKET available: ${this.r2Bucket ? 'YES' : 'NO'}`);
      
      // ✅ Use S3 if configured (Fallback or Primary)
      if (this.s3Fallback) {
        console.log('[StorageService] 🔄 Using S3 storage...');
        const resolvedContentType = resolveContentType(file, contentType);
        
        // Convert UploadableFile to Buffer/File for S3 fallback
        const uploadBody = await getUploadBody(file);
        const buffer = uploadBody instanceof ReadableStream 
          ? await new Response(uploadBody).arrayBuffer().then(ab => Buffer.from(ab))
          : Buffer.from(uploadBody as any);

        await this.s3Fallback.uploadFile(fileKey, buffer, resolvedContentType);
        
        const url = `${this.r2Domain}/${fileKey}`;
        console.log(`[StorageService] ✅ Uploaded via S3. URL: ${url}`);
        return { url, key: fileKey };
      }

      // ✅ Fallback to R2 binding if no S3 fallback or we are in remote mode
      if (!this.r2Bucket) {
        console.error('[StorageService] ❌ R2_BUCKET is not initialized and no S3 fallback found');
        throw new Error('R2_BUCKET is not available and S3 fallback is not configured.');
      }

      const body = await getUploadBody(file);
      const resolvedContentType = resolveContentType(file, contentType);

      // Upload to R2
      console.log('[StorageService] Calling r2Bucket.put()...');
      console.log(`[StorageService] Content-Type: ${resolvedContentType}`);
      const uploadResult = await this.r2Bucket.put(fileKey, body, {
        httpMetadata: {
          contentType: resolvedContentType,
          contentDisposition: 'inline',
        },
      });

      console.log(`[StorageService] ✅ File uploaded successfully to R2`);
      console.log(`[StorageService] Upload result:`, uploadResult);

      // Verify upload exists when API supports head()
      const head = await this.r2Bucket.head(fileKey);
      if (!head) {
        console.error('[StorageService] ❌ Uploaded file not found on R2 after put');
        throw new Error('Upload verification failed: file not present in R2');
      }
      console.log(`[StorageService] ✅ Upload verified. Stored size: ${head.size} bytes`);

      // ✅ Generate public URL from environment variables
      const url = `${this.r2Domain}/${fileKey}`;

      console.log(`[StorageService] 🔗 Generated URL: ${url}`);

      return { url, key: fileKey };
    } catch (error) {
      console.error(`[StorageService] ❌ Upload failed:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to upload file to R2: ${errorMessage}`);
    }
  }

  private isRemoteR2(): boolean {
    // If we have an R2 bucket binding, we're in "Remote R2" mode.
    // However, if we're in development, we might still prefer S3 fallback if available.
    if (process.env.NODE_ENV === 'production') {
      return !!this.r2Bucket;
    }
    return false;
  }

  async getFile(key: string): Promise<R2ObjectBody | null> {
    // Priority: S3 fallback if available, then R2 bucket
    if (this.s3Fallback) {
      const s3File = await this.s3Fallback.getFile(key);
      if (s3File) return s3File as any;
    }

    if (!this.r2Bucket) return null;
    return await this.r2Bucket.get(key);
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // ✅ For Cloudflare R2 public URLs, just return the public URL
    // If your bucket is public, no signing needed
    // If bucket is private, you'd need to use S3-compatible signing
    return `${this.r2Domain}/${key}`;
  }

  getAssetProxyUrl(publicUrl: string | null | undefined): string | null {
    if (!publicUrl) return null;

    const normalizedDomain = this.r2Domain.replace(/\/$/, '');
    if (!publicUrl.startsWith(`${normalizedDomain}/`)) {
      return publicUrl;
    }

    const key = publicUrl.slice(normalizedDomain.length + 1);
    if (!key) {
      return publicUrl;
    }

    return `${this.apiBaseUrl}/api/assets/r2/${encodeURIComponent(key)}`;
  }

  getEsignatureAssetProxyUrlFromPublicUrl(publicUrl: string | null | undefined): string | null {
    return this.getAssetProxyUrl(publicUrl);
  }

  validateFileType(fileName: string, allowedTypes: string[]): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext ? allowedTypes.includes(ext) : false;
  }

  validateFileSize(size: number, maxSizeMB: number): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return size <= maxSizeBytes;
  }

  async deleteFile(fileKey: string): Promise<void> {
    if (this.s3Fallback) {
      await this.s3Fallback.deleteFile(fileKey);
      return;
    }

    if (!this.r2Bucket) return;

    try {
      await this.r2Bucket.delete(fileKey);
      console.log(`[StorageService] ✅ File deleted from R2: ${fileKey}`);
    } catch (error) {
      console.error(`[StorageService] ❌ Failed to delete file:`, error);
    }
  }

  generateUniqueFileName(originalName: string): string {
    const ext = originalName.split('.').pop();
    const nameWithoutExt = originalName.replace(`.${ext}`, '');
    const sanitized = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '-');
    return `${sanitized}-${Date.now()}-${nanoid(8)}.${ext}`;
  }
}
