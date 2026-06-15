import redis, { isRedisReady } from '@/configs/db/redis';
import logger from '@/configs/logger/winston';

/**
 * Cache utility functions for Redis
 */
export class CacheService {
  private static normalizeTtl(ttlSeconds?: number): number | null {
    if (!ttlSeconds || ttlSeconds <= 0) {
      return null;
    }
    return Math.floor(ttlSeconds);
  }

  private static withTtlJitter(ttlSeconds: number): number {
    // Add a small jitter to reduce synchronized expirations.
    const jitter = Math.max(1, Math.floor(ttlSeconds * 0.1));
    return ttlSeconds + Math.floor(Math.random() * (jitter + 1));
  }

  /**
   * Get value from cache
   */
  static async get<T>(key: string): Promise<T | null> {
    if (!isRedisReady()) {
      return null;
    }

    try {
      const value = await redis.get(key);
      if (!value)
        return null;
      try {
        return JSON.parse(value) as T;
      }
      catch (error) {
        logger.warn('Cache payload is not valid JSON', {
          key,
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }
    catch (error) {
      logger.error('Cache get error', {
        key,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  static async set(
    key: string,
    value: unknown,
    ttlSeconds?: number,
    options: { useJitter?: boolean } = {},
  ): Promise<boolean> {
    if (!isRedisReady()) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      const normalizedTtl = CacheService.normalizeTtl(ttlSeconds);

      if (normalizedTtl) {
        const effectiveTtl = options.useJitter
          ? CacheService.withTtlJitter(normalizedTtl)
          : normalizedTtl;
        await redis.set(key, serialized, 'EX', effectiveTtl);
      }
      else {
        await redis.set(key, serialized);
      }
      return true;
    }
    catch (error) {
      logger.error('Cache set error', {
        key,
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  static async del(key: string): Promise<boolean> {
    if (!isRedisReady()) {
      return false;
    }

    try {
      await redis.del(key);
      return true;
    }
    catch (error) {
      logger.error('Cache delete error', {
        key,
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  static async delPattern(pattern: string): Promise<number> {
    if (!isRedisReady()) {
      return 0;
    }

    try {
      let cursor = '0';
      let deleted = 0;
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          500,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          // UNLINK is non-blocking and safer for large invalidations.
          deleted += await redis.unlink(...keys);
        }
      } while (cursor !== '0');
      return deleted;
    }
    catch (error) {
      logger.error('Cache delete pattern error', {
        pattern,
        message: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  static async exists(key: string): Promise<boolean> {
    if (!isRedisReady()) {
      return false;
    }

    try {
      const result = await redis.exists(key);
      return result === 1;
    }
    catch (error) {
      logger.error('Cache exists error', {
        key,
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get TTL for a key
   */
  static async getTTL(key: string): Promise<number> {
    if (!isRedisReady()) {
      return -1;
    }

    try {
      return await redis.ttl(key);
    }
    catch (error) {
      logger.error('Cache TTL error', {
        key,
        message: error instanceof Error ? error.message : String(error),
      });
      return -1;
    }
  }

  /**
   * Increment a numeric value
   */
  static async increment(key: string, by: number = 1): Promise<number> {
    if (!isRedisReady()) {
      return 0;
    }

    try {
      return await redis.incrby(key, by);
    }
    catch (error) {
      logger.error('Cache increment error', {
        key,
        message: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}

/**
 * Generate cache key from request
 */
export function generateCacheKey(prefix: string, params: Record<string, unknown> = {}): string {
  const stableStringify = (value: unknown): string => {
    if (value === null || value === undefined)
      return String(value);
    if (typeof value !== 'object')
      return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map(v => stableStringify(v)).join(',')}]`;
    }
    const obj = value as Record<string, unknown>;
    const pairs = Object.keys(obj)
      .sort()
      .map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${pairs.join(',')}}`;
  };

  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${stableStringify(params[key])}`)
    .join('|');
  return `${prefix}:${sortedParams}`;
}

export default CacheService;
