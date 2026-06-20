import type { NextFunction, Request, Response } from 'express';

import env from '@/configs/env';
import Respond from '@/lib/respond';

export function requireInternalAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const internalToken = env.INTERNAL_API_TOKEN?.trim();
  if (!internalToken) {
    return next();
  }

  const providedToken = req.header('x-internal-token')?.trim();
  if (providedToken && providedToken === internalToken) {
    return next();
  }

  return Respond(
    res,
    { status: 'forbidden', message: 'Internal token required.' },
    403,
  );
}
