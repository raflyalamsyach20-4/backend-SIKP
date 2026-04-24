import { nanoid } from 'nanoid';

type UploadableFile =
  | File
  | Blob
  | ArrayBuffer
  | Uint8Array
  | ReadableStream<Uint8Array>;

const hasArrayBuffer = (value: UploadableFile): value is File | Blob => {
  return typeof value === 'object' && value !== null && 'arrayBuffer' in value;
};

const getUploadBody = async (
  file: UploadableFile
): Promise<ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>> => {
  if (file instanceof ArrayBuffer || file instanceof Uint8Array || file instanceof ReadableStream) {
    return file;
  }

  if (hasArrayBuffer(file)) {
    return await file.arrayBuffer();
  }

  return new Uint8Array();
};

const getFileSize = (file: UploadableFile): number | undefined => {
  if (file instanceof ArrayBuffer) {
    return file.byteLength;
  }

  if (file instanceof Uint8Array) {
    return file.byteLength;
  }

  if (typeof file === 'object' && file !== null && 'size' in file && typeof file.size === 'number') {
    return file.size;
  }

  return undefined;
};

const resolveContentType = (file: UploadableFile, explicit?: string): string => {
  if (explicit) {
    return explicit;
  }

  if (typeof file === 'object' && file !== null && 'type' in file && typeof file.type === 'string' && file.type) {
    return file.type;
  }

  return 'application/octet-stream';
};

export class StorageService {
  private r2Domain: string;
  private r2BucketName: string;
  private apiBaseUrl: string;
  private r2Bucket: R2Bucket | null;

  constructor(r2Bucket: R2Bucket | undefined, r2Domain?: string, r2BucketName?: string, apiBaseUrl?: string) {
    // Get from parameters (passed from index.ts) or fall back to environment variables
    this.r2Domain = r2Domain || process.env.R2_DOMAIN || '';
    this.r2BucketName = r2BucketName || process.env.R2_BUCKET_NAME || '';
    this.apiBaseUrl = (apiBaseUrl || process.env.API_BASE_URL || '').replace(/\/$/, '');
    this.r2Bucket = r2Bucket || null;

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
    if (!this.r2Bucket && process.env.NODE_ENV !== 'development') {
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
      
      // ✅ Check if R2_BUCKET is initialized
      if (!this.r2Bucket) {
        console.error('[StorageService] ❌ R2_BUCKET is not initialized');
        console.error('[StorageService] This is a Cloudflare Workers binding that requires deployment.');
        console.error('[StorageService] Local development requires: npx wrangler deploy');
        throw new Error('R2_BUCKET is not available. This feature requires Cloudflare Workers deployment. Please run: npx wrangler deploy');
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

  async getFile(key: string): Promise<R2ObjectBody | null> {
    if (!this.r2Bucket) {
      return null;
    }
    return await this.r2Bucket.get(key);
  }

  async deleteFile(key: string): Promise<void> {
    if (!this.r2Bucket) {
      return;
    }
    await this.r2Bucket.delete(key);
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // ✅ For Cloudflare R2 public URLs, just return the public URL
    // If your bucket is public, no signing needed
    // If bucket is private, you'd need to use S3-compatible signing
    return `${this.r2Domain}/${key}`;
  }

  getEsignatureAssetProxyUrlFromPublicUrl(publicUrl: string | null | undefined): string | null {
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

  validateFileType(fileName: string, allowedTypes: string[]): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext ? allowedTypes.includes(ext) : false;
  }

  validateFileSize(size: number, maxSizeMB: number): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return size <= maxSizeBytes;
  }

  generateUniqueFileName(originalName: string): string {
    const ext = originalName.split('.').pop();
    const nameWithoutExt = originalName.replace(`.${ext}`, '');
    const sanitized = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '-');
    return `${sanitized}-${Date.now()}-${nanoid(8)}.${ext}`;
  }
}
