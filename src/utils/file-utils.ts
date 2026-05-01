
type UploadableFile =
  | File
  | Blob
  | ArrayBuffer
  | Uint8Array
  | ReadableStream<Uint8Array>;

const hasArrayBuffer = (value: UploadableFile): value is File | Blob => {
  return typeof value === 'object' && value !== null && 'arrayBuffer' in value;
};

export const getUploadBody = async (
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

export const getFileSize = (file: UploadableFile): number | undefined => {
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

export const resolveContentType = (file: UploadableFile, explicit?: string): string => {
  if (explicit) {
    return explicit;
  }

  if (typeof file === 'object' && file !== null && 'type' in file && typeof file.type === 'string' && file.type) {
    return file.type;
  }

  return 'application/octet-stream';
};

export type { UploadableFile };
