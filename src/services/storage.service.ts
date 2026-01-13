import { nanoid } from 'nanoid';

export class StorageService {
  constructor(private r2Bucket: R2Bucket) {}

  async uploadFile(
    file: File | Buffer,
    fileName: string,
    folder: string = 'documents'
  ): Promise<{ url: string; key: string }> {
    const fileKey = `${folder}/${Date.now()}-${nanoid(10)}-${fileName}`;
    
    // Upload to R2
    await this.r2Bucket.put(fileKey, file);

    // Generate public URL (sesuaikan dengan domain R2 Anda)
    const url = `https://your-r2-domain.com/${fileKey}`;

    return { url, key: fileKey };
  }

  async getFile(key: string): Promise<R2ObjectBody | null> {
    return await this.r2Bucket.get(key);
  }

  async deleteFile(key: string): Promise<void> {
    await this.r2Bucket.delete(key);
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // For Cloudflare R2, you might need to implement signed URLs differently
    // This is a placeholder
    return `https://your-r2-domain.com/${key}`;
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
