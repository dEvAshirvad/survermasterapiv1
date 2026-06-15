import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import env from '@/configs/env';

interface PresignPutParams {
  key: string;
  contentType: string;
  contentLength: number;
}

interface PresignGetParams {
  key: string;
  downloadFileName?: string;
}

function readStorageConfig() {
  return {
    endpoint: env.MINIO_ENDPOINT?.trim(),
    region: env.MINIO_REGION?.trim() || 'us-east-1',
    bucket: env.MINIO_BUCKET?.trim(),
    accessKeyId: env.MINIO_ACCESS_KEY_ID?.trim(),
    secretAccessKey: env.MINIO_SECRET_ACCESS_KEY?.trim(),
    forcePathStyle: env.MINIO_FORCE_PATH_STYLE,
    uploadExpiresIn: env.MINIO_PRESIGN_UPLOAD_EXPIRES_SECONDS,
    downloadExpiresIn: env.MINIO_PRESIGN_DOWNLOAD_EXPIRES_SECONDS,
  };
}

let storageClient: S3Client | null = null;

function getStorageClient(): S3Client {
  if (storageClient)
    return storageClient;

  const cfg = readStorageConfig();
  if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error('MinIO storage is not fully configured');
  }

  storageClient = new S3Client({
    endpoint: cfg.endpoint.replace(/\/+$/, ''),
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return storageClient;
}

export function isS3Configured(): boolean {
  const cfg = readStorageConfig();
  return Boolean(
    cfg.endpoint
    && cfg.bucket
    && cfg.region
    && cfg.accessKeyId
    && cfg.secretAccessKey,
  );
}

export function assertS3Configured(): void {
  if (!isS3Configured()) {
    throw new Error('MinIO storage is not configured');
  }
}

export async function ensureStorageBucketExists(): Promise<void> {
  assertS3Configured();
  const cfg = readStorageConfig();
  const client = getStorageClient();
  try {
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
  }
  catch {
    await client.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
  }
}

export async function presignPutObject(params: PresignPutParams): Promise<{
  uploadUrl: string;
  expiresInSeconds: number;
}> {
  assertS3Configured();
  const cfg = readStorageConfig();
  const client = getStorageClient();
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: cfg.uploadExpiresIn,
  });
  return { uploadUrl, expiresInSeconds: cfg.uploadExpiresIn };
}

export async function presignGetObject(params: PresignGetParams): Promise<{
  downloadUrl: string;
  expiresInSeconds: number;
}> {
  assertS3Configured();
  const cfg = readStorageConfig();
  const client = getStorageClient();
  const command = new HeadObjectCommand({
    Bucket: cfg.bucket,
    Key: params.key,
  });
  await client.send(command);

  const getCommand = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key: params.key,
    ResponseContentDisposition: params.downloadFileName
      ? `attachment; filename="${params.downloadFileName.replace(/"/g, '')}"`
      : undefined,
  });
  const downloadUrl = await getSignedUrl(client, getCommand, {
    expiresIn: cfg.downloadExpiresIn,
  });
  return { downloadUrl, expiresInSeconds: cfg.downloadExpiresIn };
}

export async function headObject(key: string): Promise<{
  contentLength?: number;
  contentType?: string;
}> {
  assertS3Configured();
  const cfg = readStorageConfig();
  const client = getStorageClient();
  const response = await client.send(
    new HeadObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    }),
  );
  return {
    contentLength: response.ContentLength,
    contentType: response.ContentType,
  };
}

export async function deleteObject(key: string): Promise<void> {
  assertS3Configured();
  const cfg = readStorageConfig();
  const client = getStorageClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    }),
  );
}
