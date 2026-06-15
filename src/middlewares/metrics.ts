import type { NextFunction, Request, Response } from 'express';

import { recordRouteMetric } from '@/configs/metrics';

export default function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const start = Date.now();

  res.on('finish', () => {
    recordRouteMetric({
      method: req.method,
      route: req.baseUrl ? `${req.baseUrl}${req.path}` : req.path,
      statusCode: res.statusCode,
      latencyMs: Date.now() - start,
    });
  });

  return next();
}
