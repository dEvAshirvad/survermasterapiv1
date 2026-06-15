import type { NextFunction, Request, Response } from 'express';

import mongoSanitizePkg from 'express-mongo-sanitize';

/**
 * express-mongo-sanitize assigns `req.query = target` after sanitizing. Express 5
 * defines `req.query` as a getter-only property on the request prototype, so that
 * assignment throws (see express/lib/request.js `defineGetter(req, 'query', …)`).
 *
 * This wrapper matches the upstream middleware behaviour for default usage but
 * pins the sanitized query object with `Object.defineProperty` on the request
 * instance (same approach as `zod-validate-request` for validated query).
 *
 * Note: `onSanitize` / `dryRun` parity with the upstream middleware is not
 * preserved here; the app uses `mongoSanitize()` with no options. Extend this
 * module if you need those flags.
 */
const sanitize = mongoSanitizePkg.sanitize as (
  target: unknown,
  options?: Record<string, unknown>,
) => unknown;

export type MongoSanitizeOptions = NonNullable<Parameters<typeof mongoSanitizePkg>[0]>;

function setValidatedQuery(req: Request, value: Request['query']) {
  Object.defineProperty(req, 'query', {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export default function mongoSanitizeExpress5(options?: MongoSanitizeOptions) {
  const opts = options ?? {};

  return function mongoSanitizeMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ) {
    const o = opts as Record<string, unknown>;

    if (req.body) {
      req.body = sanitize(req.body, o) as Request['body'];
    }
    if (req.params) {
      req.params = sanitize(req.params, o) as Request['params'];
    }
    if (req.headers) {
      req.headers = sanitize(req.headers, o) as Request['headers'];
    }
    if (req.query) {
      const q = sanitize(req.query, o) as Request['query'];
      setValidatedQuery(req, q);
    }

    next();
  };
}
