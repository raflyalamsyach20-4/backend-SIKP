import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';

/**
 * S3-compatible R2 upload untuk fallback saat R2 binding tidak tersedia
 * Menggunakan credential-based authentication (API tokens)
 */
export class S3R2Storage {
  private s3Client: S3Client | null = null;
  private bucketName: string;

  constructor(bucketName: string, s3Config?: { accessKeyId: string; secretAccessKey: string; endpoint: string }) {
    this.bucketName = bucketName;

    // Only initialize S3 client if credentials provided
    if (s3Config?.accessKeyId && s3Config?.secretAccessKey) {
      this.s3Client = new S3Client({
        region: 'auto',
        credentials: {
          accessKeyId: s3Config.accessKeyId,
          secretAccessKey: s3Config.secretAccessKey,
        },
        endpoint: s3Config.endpoint,
      });
    }
  }

  async uploadFile(fileKey: string, fileData: Buffer | File, contentType: string = 'application/octet-stream'): Promise<string> {
    if (!this.s3Client) {
      throw new Error('S3 client not configured. Provide S3 credentials to enable S3-compatible uploads.');
    }

    try {
      console.log(`[S3R2Storage] 📤 Uploading to S3-compatible R2: ${fileKey}`);

      const buffer = fileData instanceof File ? Buffer.from(await fileData.arrayBuffer()) : fileData;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        Body: buffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);

      console.log(`[S3R2Storage] ✅ File uploaded successfully`);
      return fileKey;
    } catch (error) {
      console.error(`[S3R2Storage] ❌ Upload failed:`, error);
      throw error;
    }
  }
}
