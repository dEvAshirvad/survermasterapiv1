import type { NextFunction, Request, Response } from 'express';

import chalk from 'chalk';

import env from '@/configs/env';
import logger from '@/configs/logger/winston';

/**
 * Get color for HTTP status code
 */
function getStatusColor(statusCode: number) {
  if (statusCode >= 500)
    return chalk.red;
  if (statusCode >= 400)
    return chalk.yellow;
  if (statusCode >= 300)
    return chalk.cyan;
  return chalk.green;
}

/**
 * Get color for HTTP method
 */
function getMethodColor(method: string) {
  switch (method.toUpperCase()) {
    case 'GET':
      return chalk.blue;
    case 'POST':
      return chalk.green;
    case 'PUT':
      return chalk.yellow;
    case 'PATCH':
      return chalk.magenta;
    case 'DELETE':
      return chalk.red;
    default:
      return chalk.white;
  }
}

/**
 * Middleware to log HTTP requests in development mode
 * Logs request method, URL, status code, response time, and IP address
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Keep test logs clean; request logs add little value there.
  if (env.NODE_ENV === 'test') {
    return next();
  }

  const startTime = Date.now();

  // Log request when response finishes
  res.on('finish', () => {
    if (req.originalUrl === '/health' || req.originalUrl === '/ready') {
      return;
    }

    const duration = Date.now() - startTime;
    const { method, originalUrl, ip } = req;
    const { statusCode } = res;

    // Get user agent
    const userAgent = req.get('user-agent') || 'unknown';

    // Get request ID if available
    const requestId = req.id || 'unknown';

    const methodColor = getMethodColor(method);
    const statusColor = getStatusColor(statusCode);
    const durationColor
      = duration > 1000 ? chalk.red : duration > 500 ? chalk.yellow : chalk.gray;
    const prettyMessage = [
      methodColor(method.padEnd(7)),
      statusColor(statusCode.toString()),
      chalk.white(originalUrl),
      durationColor(`${duration}ms`),
      chalk.gray(`- ${ip}`),
    ].join(' ');

    // Structured request log for observability.
    logger.log('request', {
      method,
      url: originalUrl,
      statusCode,
      durationMs: duration,
      ip,
      userAgent,
      requestId,
      timestamp: new Date().toISOString(),
      message: env.NODE_ENV === 'development' ? prettyMessage : 'http_request',
    });
  });

  next();
}
