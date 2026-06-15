import env from '@/configs/env';

const localhostOrigins = Array.from(
  { length: 11 },
  (_, i) => `http://localhost:${3000 + i}`,
);

const configuredOrigins = (env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([...localhostOrigins, ...configuredOrigins]),
);

export default allowedOrigins;
