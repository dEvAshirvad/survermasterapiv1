import type { NextFunction, Request, Response } from 'express';

import { isRedisReady } from '@/configs/db/redis';
import logger from '@/configs/logger/winston';
import CacheService, { generateCacheKey } from '@/lib/cache';

/**
 * Cache middleware options
 */
interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyPrefix?: string; // Prefix for cache key
  includeQuery?: boolean; // Include query params in cache key
  includeBody?: boolean; // Include body in cache key (for POST/PUT)
  skipCache?: (req: Request) => boolean; // Function to skip caching
  exposeCacheKey?: boolean; // Include cache key in response headers
  ttlJitter?: boolean; // Add random jitter to spread key expirations
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Cache middleware for Express routes
 * Caches GET requests by default
 */
export function cacheMiddleware(options: CacheOptions = {}) {
  const {
    ttl = 300, // Default 5 minutes
    keyPrefix = 'api',
    includeQuery = true,
    includeBody = false,
    skipCache,
    exposeCacheKey = false,
    ttlJitter = true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests by default
    if (req.method !== 'GET') {
      return next();
    }

    if (!isRedisReady()) {
      res.setHeader('X-Cache', 'BYPASS');
      return next();
    }

    // Skip cache if function returns true
    if (skipCache && skipCache(req)) {
      return next();
    }

    // Respect explicit cache bypass
    if (
      String(req.headers['cache-control'] ?? '')
        .toLowerCase()
        .includes('no-cache')
    ) {
      return next();
    }

    // Generate cache key
    const cacheParams: Record<string, unknown> = {
      method: req.method,
      baseUrl: req.baseUrl,
      path: req.path,
    };

    if (includeQuery && Object.keys(req.query).length > 0) {
      cacheParams.query = req.query;
    }

    if (includeBody && isPlainObject(req.body) && Object.keys(req.body).length > 0) {
      cacheParams.body = req.body;
    }

    const cacheKey = generateCacheKey(keyPrefix, cacheParams);

    try {
      // Try to get from cache
      const cached = await CacheService.get<unknown>(cacheKey);

      if (cached !== null) {
        logger.debug('Cache hit', { cacheKey });
        // Set cache headers
        res.setHeader('X-Cache', 'HIT');
        if (exposeCacheKey) {
          res.setHeader('X-Cache-Key', cacheKey);
        }
        return res.json(cached);
      }

      // Cache miss - continue to route handler
      logger.debug('Cache miss', { cacheKey });
      res.setHeader('X-Cache', 'MISS');
      if (exposeCacheKey) {
        res.setHeader('X-Cache-Key', cacheKey);
      }

      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = function (body: unknown) {
        const status = res.statusCode;
        const canCacheStatus = status >= 200 && status < 300;
        const hasSetCookie = res.hasHeader('Set-Cookie');
        const responseCacheControl = String(res.getHeader('Cache-Control') ?? '')
          .toLowerCase()
          .trim();
        const disallowByHeader
          = responseCacheControl.includes('no-store')
            || responseCacheControl.includes('private');

        if (canCacheStatus && !hasSetCookie && !disallowByHeader) {
          // Cache the response asynchronously (don't block response)
          CacheService.set(cacheKey, body, ttl, { useJitter: ttlJitter }).catch((error) => {
            logger.error('Failed to cache response', {
              cacheKey,
              message: error instanceof Error ? error.message : String(error),
            });
          });
        }

        return originalJson(body);
      };

      next();
    }
    catch (error) {
      logger.error('Cache middleware error', {
        message: error instanceof Error ? error.message : String(error),
      });
      // Continue without caching on error
      next();
    }
  };
}

/**
 * Invalidate cache by pattern
 */
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const deleted = await CacheService.delPattern(pattern);
    logger.info('Cache invalidation completed', { deleted, pattern });
  }
  catch (error) {
    logger.error('Failed to invalidate cache', {
      pattern,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Clear all cache for a specific route
 */
export async function clearRouteCache(route: string): Promise<void> {
  await invalidateCache(`api:*path:${route}*`);
}
