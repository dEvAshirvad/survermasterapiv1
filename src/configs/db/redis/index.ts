import Redis from 'ioredis';

import env from '@/configs/env';
import logger from '@/configs/logger/winston';

/**
 * Production-grade Redis connection.
 */
const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    return Math.min(times * 100, 2000);
  },
  lazyConnect: true,
  keepAlive: 30000,
  // Fail fast when Redis is unavailable to avoid request pileups.
  enableOfflineQueue: false,
  enableReadyCheck: true,
  connectTimeout: 10000,
});

let isConnecting = false;
let lastReadyAt: string | null = null;
let lastError: string | null = null;

redis.on('connect', () => {
  logger.info('Redis client connecting...');
});

redis.on('ready', () => {
  lastReadyAt = new Date().toISOString();
  lastError = null;
  logger.info('Redis client ready');
});

redis.on('error', (error: Error) => {
  lastError = error.message;
  logger.error('Redis error', { message: error.message });
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

export async function connectRedis(): Promise<void> {
  if (isRedisReady() || isConnecting) {
    return;
  }
  isConnecting = true;
  try {
    await redis.connect();
  }
  finally {
    isConnecting = false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis.status === 'end') {
    return;
  }
  await redis.quit();
}

export function getRedisStatus() {
  return {
    status: redis.status,
    isReady: isRedisReady(),
    isConnecting,
    lastReadyAt,
    lastError,
  };
}

export function isRedisReady(): boolean {
  return redis.status === 'ready';
}

export async function checkRedisReadiness(timeoutMs = 1000): Promise<{
  isReady: boolean;
  status: string;
  latencyMs: number | null;
  error: string | null;
}> {
  if (!isRedisReady()) {
    return {
      isReady: false,
      status: redis.status,
      latencyMs: null,
      error: lastError ?? 'Redis client is not in ready state',
    };
  }

  const start = Date.now();
  try {
    const pingResult = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis readiness ping timeout')), timeoutMs),
      ),
    ]);

    if (pingResult !== 'PONG') {
      return {
        isReady: false,
        status: redis.status,
        latencyMs: Date.now() - start,
        error: `Unexpected ping response: ${String(pingResult)}`,
      };
    }

    return {
      isReady: true,
      status: redis.status,
      latencyMs: Date.now() - start,
      error: null,
    };
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastError = message;
    return {
      isReady: false,
      status: redis.status,
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}

export default redis;
