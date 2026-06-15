import type { NextFunction, Request, Response } from 'express';

import { ZodError } from 'zod';

import env from '@/configs/env';
import APIError from '@/configs/errors/APIError';
import logger from '@/configs/logger/winston';
import { RespondError } from '@/lib/respond';
import { HttpErrorStatusCode } from '@/types/errors/errors.types';

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) {
    return next(error as Error);
  }

  const requestId = req.id;

  if (error instanceof APIError) {
    logger.warn('Operational API error', {
      requestId,
      statusCode: error.statusCode,
      code: error.code,
      title: error.title,
      message: error.message,
      meta: error.meta,
    });

    return RespondError(res, error.serializeError(requestId), error.statusCode);
  }

  if (error instanceof ZodError) {
    const validationError = new APIError({
      STATUS: HttpErrorStatusCode.BAD_REQUEST,
      CODE: 'VALIDATION_ERROR',
      TITLE: 'VALIDATION_ERROR',
      MESSAGE: 'Invalid request data',
      ERRORS: error.flatten(),
    });
    logger.warn('Validation error', {
      requestId,
      issues: error.issues.length,
    });
    return RespondError(
      res,
      validationError.serializeError(requestId),
      validationError.statusCode,
    );
  }

  const fallbackMessage
    = env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again later.'
      : error instanceof Error
        ? error.message
        : 'Unexpected error occurred';

  logger.error('Unhandled error', {
    requestId,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : error,
  });

  return RespondError(
    res,
    {
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Internal Server Error',
      message: fallbackMessage,
      requestId,
    },
    HttpErrorStatusCode.INTERNAL_SERVER,
  );
}
