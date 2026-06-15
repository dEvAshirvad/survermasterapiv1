import type { NextFunction, Request, Response } from 'express';

import APIError from '@/configs/errors/APIError';
import {
  buildIdempotencyRedisKey,
  completeIdempotentRequest,
  createFingerprint,
  IDEMPOTENCY_KEY_HEADER,
  startIdempotentRequest,
} from '@/lib/idempotency';
import { HttpErrorStatusCode } from '@/types/errors/errors.types';

const IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const IMPORT_ROUTE_BYPASS = new Set([
  '/api/v1/contacts/import',
  '/api/v1/products/import',
]);

export default async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!IDEMPOTENT_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const requestPath = `${req.baseUrl}${req.path}`;
  if (IMPORT_ROUTE_BYPASS.has(requestPath)) {
    return next();
  }

  const idempotencyKey = req.header(IDEMPOTENCY_KEY_HEADER)?.trim();
  if (!idempotencyKey) {
    return next();
  }

  const scope = `${req.method.toUpperCase()}:${req.baseUrl}${req.path}:${req.user?.id ?? 'anonymous'}`;
  const redisKey = buildIdempotencyRedisKey(scope, idempotencyKey);
  const fingerprint = createFingerprint({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  const started = await startIdempotentRequest(redisKey, fingerprint, req.id);
  if (!started.started) {
    const existing = started.existing;
    if (existing && existing.fingerprint !== fingerprint) {
      return next(
        new APIError({
          STATUS: HttpErrorStatusCode.CONFLICT,
          CODE: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
          TITLE: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
          MESSAGE:
            'This idempotency key was already used with a different payload.',
        }),
      );
    }

    if (existing?.status === 'pending') {
      return next(
        new APIError({
          STATUS: HttpErrorStatusCode.CONFLICT,
          CODE: 'IDEMPOTENT_REQUEST_IN_PROGRESS',
          TITLE: 'IDEMPOTENT_REQUEST_IN_PROGRESS',
          MESSAGE: 'A request with this idempotency key is already in progress.',
        }),
      );
    }

    if (existing?.status === 'completed' && existing.response) {
      res.setHeader('Idempotency-Status', 'replayed');
      return res.status(existing.response.status).json(existing.response.body);
    }
  }

  res.setHeader('Idempotency-Status', 'created');
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode < 500) {
      void completeIdempotentRequest(
        redisKey,
        fingerprint,
        { status: res.statusCode, body },
        req.id,
      );
    }
    return originalJson(body);
  }) as Response['json'];

  return next();
}
