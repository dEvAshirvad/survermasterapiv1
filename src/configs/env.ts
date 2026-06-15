/* eslint-disable node/no-process-env */
import { config } from 'dotenv';
import { expand } from 'dotenv-expand';
import path from 'node:path';
import { z } from 'zod';

expand(
  config({
    path: path.resolve(
      process.cwd(),
      process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    ),
  }),
);

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Reverse proxy hop count (0 in local, usually 1 behind LB/proxy).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(32).default(1),
  DEVICE_ID: z.string().min(1).default('laptop-1'),
  COOKIE_DOMAIN: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
  MONGODB_URI: z.string().url('MONGODB_URI must be a valid URL'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  AUDIT_LOGGING_DISABLED: z
    .string()
    .optional()
    .default('false')
    .transform(v => ['true', '1', 'yes'].includes(String(v).toLowerCase())),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  INTERNAL_API_TOKEN: z.string().optional(),
  // MinIO (S3-compatible object storage)
  MINIO_ENDPOINT: z.string().url().optional(),
  MINIO_REGION: z.string().default('us-east-1'),
  MINIO_BUCKET: z.string().optional(),
  MINIO_ACCESS_KEY_ID: z.string().optional(),
  MINIO_SECRET_ACCESS_KEY: z.string().optional(),
  MINIO_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .default('true')
    .transform(v => ['true', '1', 'yes'].includes(String(v).toLowerCase())),
  MINIO_PRESIGN_UPLOAD_EXPIRES_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),
  MINIO_PRESIGN_DOWNLOAD_EXPIRES_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(300),
})
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      const redisPassword = data.REDIS_PASSWORD?.trim();
      if (!redisPassword || redisPassword.length < 12) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'REDIS_PASSWORD is required in production (min 12 characters).',
          path: ['REDIS_PASSWORD'],
        });
      }
    }

    const minioFields = [
      data.MINIO_ENDPOINT,
      data.MINIO_BUCKET,
      data.MINIO_ACCESS_KEY_ID,
      data.MINIO_SECRET_ACCESS_KEY,
    ];
    const anyMinioConfigured = minioFields.some(Boolean);
    const allMinioConfigured = minioFields.every(Boolean);
    if (anyMinioConfigured && !allMinioConfigured) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'If enabling MinIO storage, set MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY_ID, and MINIO_SECRET_ACCESS_KEY.',
        path: ['MINIO_ENDPOINT'],
      });
    }
  });

export type env = z.infer<typeof EnvSchema>;

// eslint-disable-next-line ts/no-redeclare
const { data: env, error } = EnvSchema.safeParse(process.env);

if (error) {
  console.error('❌ Invalid env:');
  console.error(JSON.stringify(error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export default env!;
