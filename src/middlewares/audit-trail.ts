import type { NextFunction, Request, Response } from 'express';

import env from '@/configs/env';
import logger from '@/configs/logger/winston';

const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LEADING_SLASHES_REGEX = /^\/+/;
const AUDIT_DISABLED = env.AUDIT_LOGGING_DISABLED;

function toAuditAction(
  method: string,
): 'create' | 'update' | 'delete' | null {
  if (method === 'POST')
    return 'create';
  if (method === 'PUT' || method === 'PATCH')
    return 'update';
  if (method === 'DELETE')
    return 'delete';
  return null;
}

export default function auditTrail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (AUDIT_DISABLED) {
    return next();
  }

  const method = req.method.toUpperCase();
  if (!AUDITED_METHODS.has(method)) {
    return next();
  }

  res.on('finish', () => {
    if (res.statusCode >= 500 || res.statusCode === 404) {
      return;
    }

    const action = toAuditAction(method);
    if (!action) {
      return;
    }

    const pathWithoutPrefix = req.path.replace(LEADING_SLASHES_REGEX, '');
    const [entityType = 'unknown', entityId] = pathWithoutPrefix.split('/');
    logger.info('audit_event', {
      actorId: req.user?.id ?? 'anonymous',
      action,
      entityType,
      entityId,
      path: req.originalUrl,
      method,
      statusCode: res.statusCode,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      meta: {
        params: req.params,
      },
    });
  });

  return next();
}
