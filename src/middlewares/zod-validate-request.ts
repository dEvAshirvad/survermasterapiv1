import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

import { ZodError } from 'zod';

import APIError from '@/configs/errors/APIError';
import { AUTHORIZATION_ERRORS } from '@/configs/errors/AUTHORIZATION_ERRORS';

/**
 * Express 5 exposes `req.query` as a getter-only property; assigning to it throws.
 * Shadow it with a validated object on the request instance.
 */
function setValidatedQuery(req: Request, value: Request['query']) {
  Object.defineProperty(req, 'query', {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export function validateRequest({
  body,
  query,
  params,
}: {
  body?: ZodType<unknown>;
  query?: ZodType<unknown>;
  params?: ZodType<unknown>;
}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (body) {
        req.body = await body.parseAsync(req.body);
      }
      if (query) {
        const parsed = (await query.parseAsync(req.query)) as Request['query'];
        setValidatedQuery(req, parsed);
      }
      if (params) {
        req.params = (await params.parseAsync(req.params)) as Request['params'];
      }
      return next();
    }
    catch (error) {
      if (error instanceof ZodError) {
        return next(
          new APIError({
            ...AUTHORIZATION_ERRORS.VALIDATION_ERROR,
            ERRORS: error.flatten(),
          }),
        );
      }
      return next(error);
    }
  };
}
